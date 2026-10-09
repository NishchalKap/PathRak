"""PathRak's dependency-free DAA engine.

All algorithms in this module operate on a small, explicit graph format.  They
never delegate shortest-path or MST work to a routing provider: providers are
only used elsewhere to obtain real road geometry.
"""
from __future__ import annotations

from dataclasses import dataclass
from heapq import heappop, heappush
from random import Random
from time import perf_counter
from typing import Any, Iterable


CRITERIA = {"distance", "time", "cost", "risk"}


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    weights: dict[str, float]


def _node(value: Any) -> str:
    return str(value)


def build_graph(nodes: Iterable[Any], edges: Iterable[dict], directed: bool = False) -> tuple[list[str], list[Edge], dict[str, list[tuple[str, Edge]]]]:
    """Validate and materialise the application's documented graph shape."""
    node_list = list(dict.fromkeys(_node(node) for node in nodes))
    known = set(node_list)
    materialized: list[Edge] = []
    adjacency = {node: [] for node in node_list}
    for raw in edges:
        source, target = _node(raw.get("source")), _node(raw.get("target"))
        if source not in known or target not in known:
            raise ValueError("Every edge endpoint must be present in nodes.")
        weights = {criterion: float(raw.get(criterion, raw.get("weight", 1))) for criterion in CRITERIA}
        if any(weight < 0 for weight in weights.values()):
            raise ValueError("Dijkstra requires non-negative edge weights.")
        edge = Edge(source, target, weights)
        materialized.append(edge)
        adjacency[source].append((target, edge))
        if not directed:
            adjacency[target].append((source, edge))
    return node_list, materialized, adjacency


def bfs(nodes: Iterable[Any], edges: Iterable[dict], start: Any, target: Any | None = None, directed: bool = False) -> dict:
    node_list, _, adjacency = build_graph(nodes, edges, directed)
    start = _node(start)
    target = _node(target) if target is not None else None
    if start not in adjacency or (target is not None and target not in adjacency):
        raise ValueError("Start and target must be graph vertices.")
    queue, visited, predecessor, order = [start], {start}, {start: None}, []
    edges_examined = 0
    while queue:
        current = queue.pop(0)
        order.append(current)
        if current == target:
            break
        for neighbour, _ in adjacency[current]:
            edges_examined += 1
            if neighbour not in visited:
                visited.add(neighbour)
                predecessor[neighbour] = current
                queue.append(neighbour)
    path = _reconstruct(predecessor, target) if target in predecessor else []
    return {"algorithm": "BFS", "traversal_order": order, "visited_vertices": sorted(visited), "reachable": target in visited if target else True, "path": path, "nodes_visited": len(order), "edges_examined": edges_examined}


def dfs(nodes: Iterable[Any], edges: Iterable[dict], start: Any, directed: bool = False) -> dict:
    node_list, _, adjacency = build_graph(nodes, edges, directed)
    start = _node(start)
    if start not in adjacency:
        raise ValueError("Start must be a graph vertex.")
    seen, order, edges_examined = set(), [], 0
    stack = [start]
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        order.append(current)
        neighbours = adjacency[current]
        edges_examined += len(neighbours)
        stack.extend(neighbour for neighbour, _ in reversed(neighbours) if neighbour not in seen)
    components = _components(node_list, adjacency)
    return {"algorithm": "DFS", "traversal_order": order, "visited_vertices": sorted(seen), "nodes_visited": len(order), "edges_examined": edges_examined, "connected_components": components}


def dijkstra(nodes: Iterable[Any], edges: Iterable[dict], start: Any, target: Any, criterion: str = "distance", directed: bool = False) -> dict:
    if criterion not in CRITERIA:
        raise ValueError(f"criterion must be one of {sorted(CRITERIA)}")
    _, _, adjacency = build_graph(nodes, edges, directed)
    start, target = _node(start), _node(target)
    if start not in adjacency or target not in adjacency:
        raise ValueError("Start and target must be graph vertices.")
    started = perf_counter()
    distances, previous, heap, processed, edges_examined = {start: 0.0}, {start: None}, [(0.0, start)], set(), 0
    while heap:
        distance, current = heappop(heap)
        if current in processed:
            continue
        processed.add(current)
        if current == target:
            break
        for neighbour, edge in adjacency[current]:
            edges_examined += 1
            candidate = distance + edge.weights[criterion]
            if candidate < distances.get(neighbour, float("inf")):
                distances[neighbour], previous[neighbour] = candidate, current
                heappush(heap, (candidate, neighbour))
    return {"algorithm": "Dijkstra", "criterion": criterion, "path": _reconstruct(previous, target) if target in previous else [], "total_weight": distances.get(target), "reachable": target in distances, "nodes_processed": len(processed), "edges_examined": edges_examined, "execution_ms": round((perf_counter() - started) * 1000, 4), "metadata": {"weight_requirement": "non-negative", "implementation": "PathRak priority-queue Dijkstra"}}


def prim(nodes: Iterable[Any], edges: Iterable[dict], criterion: str = "cost") -> dict:
    node_list, _, adjacency = build_graph(nodes, edges, False)
    if criterion not in CRITERIA:
        raise ValueError("Invalid MST criterion.")
    started, visited, selected, total, examined = perf_counter(), set(), [], 0.0, 0
    for root in node_list:
        if root in visited:
            continue
        visited.add(root)
        heap = [(edge.weights[criterion], root, neighbour, edge) for neighbour, edge in adjacency[root]]
        import heapq; heapq.heapify(heap)
        while heap:
            weight, source, target, edge = heappop(heap); examined += 1
            if target in visited:
                continue
            visited.add(target); total += weight
            selected.append({"source": source, "target": target, "weight": weight})
            for neighbour, next_edge in adjacency[target]:
                if neighbour not in visited:
                    heappush(heap, (next_edge.weights[criterion], target, neighbour, next_edge))
    return _mst_result("Prim", node_list, adjacency, selected, total, examined, started)


def kruskal(nodes: Iterable[Any], edges: Iterable[dict], criterion: str = "cost") -> dict:
    node_list, materialized, adjacency = build_graph(nodes, edges, False)
    if criterion not in CRITERIA:
        raise ValueError("Invalid MST criterion.")
    started, parent, rank, selected, total, examined = perf_counter(), {n: n for n in node_list}, {n: 0 for n in node_list}, [], 0.0, 0
    def find(vertex: str) -> str:
        while parent[vertex] != vertex:
            parent[vertex] = parent[parent[vertex]]; vertex = parent[vertex]
        return vertex
    for edge in sorted(materialized, key=lambda item: (item.weights[criterion], item.source, item.target)):
        examined += 1; left, right = find(edge.source), find(edge.target)
        if left == right:
            continue
        if rank[left] < rank[right]: left, right = right, left
        parent[right] = left
        if rank[left] == rank[right]: rank[left] += 1
        total += edge.weights[criterion]
        selected.append({"source": edge.source, "target": edge.target, "weight": edge.weights[criterion]})
    return _mst_result("Kruskal", node_list, adjacency, selected, total, examined, started)


def merge_sort(items: list[dict], key: str) -> list[dict]:
    if len(items) <= 1: return list(items)
    middle = len(items) // 2; left, right = merge_sort(items[:middle], key), merge_sort(items[middle:], key); out = []
    while left and right:
        out.append(left.pop(0) if left[0][key] <= right[0][key] else right.pop(0))
    return out + left + right


def quick_sort(items: list[dict], key: str) -> list[dict]:
    if len(items) <= 1: return list(items)
    pivot = items[len(items) // 2][key]
    return quick_sort([x for x in items if x[key] < pivot], key) + [x for x in items if x[key] == pivot] + quick_sort([x for x in items if x[key] > pivot], key)


def heap_sort(items: list[dict], key: str) -> list[dict]:
    heap = [(item[key], index, item) for index, item in enumerate(items)]
    import heapq; heapq.heapify(heap)
    return [heappop(heap)[2] for _ in range(len(heap))]


def binary_search(items: list[dict], key: str, value: Any) -> int:
    low, high = 0, len(items) - 1
    while low <= high:
        middle = (low + high) // 2
        if items[middle][key] == value: return middle
        if items[middle][key] < value: low = middle + 1
        else: high = middle - 1
    return -1


def sort_routes(routes: list[dict], key: str = "distance", algorithm: str = "merge") -> dict:
    if key not in {"distance", "eta", "cost", "risk", "score"}: raise ValueError("Unsupported route sort key.")
    if any(key not in route for route in routes): raise ValueError(f"Every route must contain '{key}'.")
    sorting = {"merge": merge_sort, "quick": quick_sort, "heap": heap_sort}.get(algorithm)
    if not sorting: raise ValueError("algorithm must be merge, quick, or heap.")
    return {"algorithm": algorithm, "key": key, "routes": sorting(routes, key)}


def optimize_projects(projects: list[dict], budget: int, method: str = "dp") -> dict:
    if budget < 0: raise ValueError("Budget cannot be negative.")
    prepared = _projects(projects); started = perf_counter()
    if method == "branch_and_bound" and len(prepared) > 32:
        raise ValueError("Branch & Bound is limited to 32 projects to keep the API responsive; use dynamic programming for larger inputs.")
    if method == "greedy":
        selected, cost = [], 0
        for item in sorted(prepared, key=lambda p: (-p["benefit"] / p["cost"] if p["cost"] else float("-inf"), p["name"])):
            if cost + item["cost"] <= budget: selected.append(item); cost += item["cost"]
        metrics = {}
    elif method == "dp":
        table = [[0] * (budget + 1) for _ in range(len(prepared) + 1)]
        for i, project in enumerate(prepared, 1):
            for b in range(budget + 1): table[i][b] = max(table[i - 1][b], table[i - 1][b - project["cost"]] + project["benefit"] if project["cost"] <= b else -1)
        selected, b = [], budget
        for i in range(len(prepared), 0, -1):
            if table[i][b] != table[i - 1][b]: selected.append(prepared[i - 1]); b -= prepared[i - 1]["cost"]
        selected.reverse(); metrics = {"table_cells": (len(prepared) + 1) * (budget + 1)}
    elif method == "branch_and_bound":
        selected, metrics = _branch_and_bound(prepared, budget)
    else: raise ValueError("method must be greedy, dp, or branch_and_bound.")
    return {"method": method, "selected_projects": selected, "total_cost": sum(p["cost"] for p in selected), "total_benefit": sum(p["benefit"] for p in selected), "execution_ms": round((perf_counter() - started) * 1000, 4), **metrics}


def synthetic_graph(size: int = 12, density: float = .3, seed: int = 42) -> dict:
    if size < 1 or size > 500 or not 0 <= density <= 1: raise ValueError("size must be 1..500 and density must be 0..1.")
    rng, nodes, edges = Random(seed), [str(i) for i in range(size)], []
    for i in range(size):
        for j in range(i + 1, size):
            if rng.random() <= density:
                weight = rng.randint(1, 100); edges.append({"source": str(i), "target": str(j), "distance": weight, "time": weight * 1.2, "cost": weight * .6, "risk": max(1, 101 - weight)})
    return {"nodes": nodes, "edges": edges, "seed": seed, "density": density}


def benchmark(algorithm: str, size: int, density: float, trials: int, seed: int = 42) -> dict:
    if trials < 1 or trials > 50: raise ValueError("trials must be between 1 and 50.")
    graph = synthetic_graph(size, density, seed); timings, result = [], None
    for _ in range(trials):
        started = perf_counter()
        if algorithm == "bfs": result = bfs(graph["nodes"], graph["edges"], "0")
        elif algorithm == "dfs": result = dfs(graph["nodes"], graph["edges"], "0")
        elif algorithm == "dijkstra": result = dijkstra(graph["nodes"], graph["edges"], "0", str(size - 1))
        elif algorithm == "prim": result = prim(graph["nodes"], graph["edges"])
        elif algorithm == "kruskal": result = kruskal(graph["nodes"], graph["edges"])
        else: raise ValueError("Unsupported benchmark algorithm.")
        timings.append((perf_counter() - started) * 1000)
    ordered = sorted(timings)
    return {"algorithm": algorithm, "dataset": {**graph, "edges": len(graph["edges"])}, "trials": trials, "median_execution_ms": round(ordered[len(ordered) // 2], 5), "metrics": {key: result.get(key) for key in ("nodes_visited", "nodes_processed", "edges_examined", "total_weight") if key in result}, "theoretical_complexity": {"bfs": "O(V + E)", "dfs": "O(V + E)", "dijkstra": "O((V + E) log V)", "prim": "O(E log V)", "kruskal": "O(E log E)"}[algorithm]}


def _reconstruct(previous: dict[str, str | None], target: str | None) -> list[str]:
    if target is None or target not in previous: return []
    path = []
    while target is not None: path.append(target); target = previous[target]
    return list(reversed(path))


def _components(nodes: list[str], adjacency: dict) -> list[list[str]]:
    remaining, result = set(nodes), []
    while remaining:
        component, stack = set(), [next(iter(remaining))]
        while stack:
            vertex = stack.pop()
            if vertex in component: continue
            component.add(vertex); stack.extend(n for n, _ in adjacency[vertex] if n not in component)
        remaining -= component; result.append(sorted(component))
    return result


def _mst_result(algorithm: str, nodes: list[str], adjacency: dict, selected: list[dict], total: float, examined: int, started: float) -> dict:
    components = _components(nodes, adjacency)
    return {"algorithm": algorithm, "selected_edges": selected, "total_weight": total, "edges_selected": len(selected), "connected_components": components, "is_forest": len(components) > 1, "edges_examined": examined, "execution_ms": round((perf_counter() - started) * 1000, 4)}


def _projects(projects: list[dict]) -> list[dict]:
    prepared = []
    for raw in projects:
        cost, benefit = int(raw["cost"]), int(raw["benefit"])
        if cost < 0 or benefit < 0: raise ValueError("Project cost and benefit must be non-negative integers.")
        prepared.append({"name": str(raw["name"]), "cost": cost, "benefit": benefit, "category": raw.get("category")})
    return prepared


def _branch_and_bound(projects: list[dict], budget: int) -> tuple[list[dict], dict]:
    ordered = sorted(projects, key=lambda p: p["benefit"] / p["cost"] if p["cost"] else float("inf"), reverse=True)
    best, nodes, pruned = (0, []), 0, 0
    def bound(index: int, cost: int, benefit: int) -> float:
        remaining, estimate = budget - cost, float(benefit)
        for project in ordered[index:]:
            if project["cost"] <= remaining: remaining -= project["cost"]; estimate += project["benefit"]
            elif project["cost"]: estimate += project["benefit"] * remaining / project["cost"]; break
        return estimate
    def visit(index: int, cost: int, benefit: int, picked: list[dict]) -> None:
        nonlocal best, nodes, pruned
        nodes += 1
        if cost <= budget and benefit > best[0]: best = (benefit, picked)
        if index == len(ordered): return
        if bound(index, cost, benefit) <= best[0]: pruned += 1; return
        project = ordered[index]
        if cost + project["cost"] <= budget: visit(index + 1, cost + project["cost"], benefit + project["benefit"], picked + [project])
        visit(index + 1, cost, benefit, picked)
    visit(0, 0, 0, [])
    return best[1], {"nodes_explored": nodes, "branches_pruned": pruned, "optimal": True}
