"""PathRak's dependency-free DAA engine.

All algorithms in this module operate on small, explicit graph and sequence formats.
They never delegate shortest-path or MST work to a routing provider: providers are
only used elsewhere to obtain real road geometry.
"""
from __future__ import annotations

from dataclasses import dataclass
from heapq import heappop, heappush
from random import Random
from time import perf_counter
from typing import Any, Iterable, List, Optional


CRITERIA = {"distance", "time", "cost", "risk"}


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    weights: dict[str, float]


class DisjointSetUnion:
    """Disjoint Set Union (DSU) with path compression and union by rank."""

    def __init__(self, elements: Iterable[Any]):
        elem_list = [str(x) for x in elements]
        self.parent: dict[str, str] = {x: x for x in elem_list}
        self.rank: dict[str, int] = {x: 0 for x in elem_list}
        self.size: dict[str, int] = {x: 1 for x in elem_list}
        self.num_components: int = len(self.parent)

    def find(self, x: Any) -> str:
        curr = str(x)
        if curr not in self.parent:
            raise ValueError(f"Vertex '{curr}' is not in the disjoint set.")
        # Full path compression
        root = curr
        while root != self.parent[root]:
            root = self.parent[root]
        curr_node = curr
        while curr_node != root:
            nxt = self.parent[curr_node]
            self.parent[curr_node] = root
            curr_node = nxt
        return root

    def union(self, a: Any, b: Any) -> bool:
        root_a = self.find(a)
        root_b = self.find(b)
        if root_a == root_b:
            return False
        # Union by rank
        if self.rank[root_a] < self.rank[root_b]:
            root_a, root_b = root_b, root_a
        self.parent[root_b] = root_a
        self.size[root_a] += self.size[root_b]
        if self.rank[root_a] == self.rank[root_b]:
            self.rank[root_a] += 1
        self.num_components -= 1
        return True

    def connected(self, a: Any, b: Any) -> bool:
        return self.find(a) == self.find(b)

    def components(self) -> list[list[str]]:
        groups: dict[str, list[str]] = {}
        for elem in self.parent:
            root = self.find(elem)
            groups.setdefault(root, []).append(elem)
        return [sorted(members) for members in sorted(groups.values(), key=lambda g: g[0])]


def _node(value: Any) -> str:
    return str(value)


def build_graph(
    nodes: Iterable[Any], edges: Iterable[dict], directed: bool = False
) -> tuple[list[str], list[Edge], dict[str, list[tuple[str, Edge]]]]:
    """Validate and materialise the application's documented graph shape."""
    node_list = list(dict.fromkeys(_node(node) for node in nodes))
    known = set(node_list)
    materialized: list[Edge] = []
    adjacency: dict[str, list[tuple[str, Edge]]] = {node: [] for node in node_list}
    for raw in edges:
        source, target = _node(raw.get("source")), _node(raw.get("target"))
        if source not in known or target not in known:
            raise ValueError("Every edge endpoint must be present in nodes.")
        weights = {
            criterion: float(raw.get(criterion, raw.get("weight", 1)))
            for criterion in CRITERIA
        }
        if any(weight < 0 for weight in weights.values()):
            raise ValueError("Dijkstra requires non-negative edge weights.")
        edge = Edge(source, target, weights)
        materialized.append(edge)
        adjacency[source].append((target, edge))
        if not directed:
            adjacency[target].append((source, edge))
    return node_list, materialized, adjacency


def bfs(
    nodes: Iterable[Any],
    edges: Iterable[dict],
    start: Any,
    target: Any | None = None,
    directed: bool = False,
) -> dict:
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
    return {
        "algorithm": "BFS",
        "traversal_order": order,
        "visited_vertices": sorted(visited),
        "reachable": target in visited if target else True,
        "path": path,
        "nodes_visited": len(order),
        "edges_examined": edges_examined,
    }


def dfs(
    nodes: Iterable[Any], edges: Iterable[dict], start: Any, directed: bool = False
) -> dict:
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
        stack.extend(
            neighbour for neighbour, _ in reversed(neighbours) if neighbour not in seen
        )
    components = _components(node_list, adjacency)
    return {
        "algorithm": "DFS",
        "traversal_order": order,
        "visited_vertices": sorted(seen),
        "nodes_visited": len(order),
        "edges_examined": edges_examined,
        "connected_components": components,
    }


def dijkstra(
    nodes: Iterable[Any],
    edges: Iterable[dict],
    start: Any,
    target: Any,
    criterion: str = "distance",
    directed: bool = False,
) -> dict:
    if criterion not in CRITERIA:
        raise ValueError(f"criterion must be one of {sorted(CRITERIA)}")
    _, _, adjacency = build_graph(nodes, edges, directed)
    start, target = _node(start), _node(target)
    if start not in adjacency or target not in adjacency:
        raise ValueError("Start and target must be graph vertices.")
    started = perf_counter()
    distances: dict[str, float] = {start: 0.0}
    previous: dict[str, Optional[str]] = {start: None}
    heap: list[tuple[float, str]] = [(0.0, start)]
    processed: set[str] = set()
    edges_examined = 0
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
                distances[neighbour] = candidate
                previous[neighbour] = current
                heappush(heap, (candidate, neighbour))
    return {
        "algorithm": "Dijkstra",
        "criterion": criterion,
        "path": _reconstruct(previous, target) if target in previous else [],
        "total_weight": distances.get(target),
        "reachable": target in distances,
        "nodes_processed": len(processed),
        "edges_examined": edges_examined,
        "execution_ms": round((perf_counter() - started) * 1000, 4),
        "metadata": {
            "weight_requirement": "non-negative",
            "implementation": "PathRak priority-queue Dijkstra",
        },
    }


def prim(
    nodes: Iterable[Any], edges: Iterable[dict], criterion: str = "cost"
) -> dict:
    node_list, _, adjacency = build_graph(nodes, edges, False)
    if criterion not in CRITERIA:
        raise ValueError("Invalid MST criterion.")
    started = perf_counter()
    visited: set[str] = set()
    selected: list[dict] = []
    total = 0.0
    examined = 0
    counter = 0

    for root in node_list:
        if root in visited:
            continue
        visited.add(root)
        heap: list[tuple[float, int, str, str, Edge]] = []
        for neighbour, edge in adjacency[root]:
            counter += 1
            heappush(heap, (edge.weights[criterion], counter, root, neighbour, edge))
        while heap:
            weight, _, source, target, edge = heappop(heap)
            examined += 1
            if target in visited:
                continue
            visited.add(target)
            total += weight
            selected.append({"source": source, "target": target, "weight": weight})
            for neighbour, next_edge in adjacency[target]:
                if neighbour not in visited:
                    counter += 1
                    heappush(
                        heap,
                        (
                            next_edge.weights[criterion],
                            counter,
                            target,
                            neighbour,
                            next_edge,
                        ),
                    )
    return _mst_result("Prim", node_list, adjacency, selected, total, examined, started)


def kruskal(
    nodes: Iterable[Any], edges: Iterable[dict], criterion: str = "cost"
) -> dict:
    node_list, materialized, adjacency = build_graph(nodes, edges, False)
    if criterion not in CRITERIA:
        raise ValueError("Invalid MST criterion.")
    started = perf_counter()
    dsu = DisjointSetUnion(node_list)
    selected: list[dict] = []
    total = 0.0
    examined = 0

    for edge in sorted(
        materialized,
        key=lambda item: (item.weights[criterion], item.source, item.target),
    ):
        examined += 1
        if dsu.union(edge.source, edge.target):
            total += edge.weights[criterion]
            selected.append(
                {"source": edge.source, "target": edge.target, "weight": edge.weights[criterion]}
            )
    return _mst_result("Kruskal", node_list, adjacency, selected, total, examined, started)


def _item_val(item: Any, key: Optional[str]) -> Any:
    if key is not None and isinstance(item, dict):
        return item[key]
    return item


def merge_sort(items: list[Any], key: Optional[str] = None) -> list[Any]:
    """Stable merge sort running in O(N log N) time."""
    if len(items) <= 1:
        return list(items)
    middle = len(items) // 2
    left = merge_sort(items[:middle], key)
    right = merge_sort(items[middle:], key)
    out: list[Any] = []
    i = j = 0
    while i < len(left) and j < len(right):
        val_l = _item_val(left[i], key)
        val_r = _item_val(right[j], key)
        if val_l <= val_r:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    out.extend(left[i:])
    out.extend(right[j:])
    return out


def quick_sort(items: list[Any], key: Optional[str] = None) -> list[Any]:
    """Quick sort using middle pivot."""
    if len(items) <= 1:
        return list(items)
    pivot_val = _item_val(items[len(items) // 2], key)
    smaller = [x for x in items if _item_val(x, key) < pivot_val]
    equal = [x for x in items if _item_val(x, key) == pivot_val]
    greater = [x for x in items if _item_val(x, key) > pivot_val]
    return quick_sort(smaller, key) + equal + quick_sort(greater, key)


def heap_sort(items: list[Any], key: Optional[str] = None) -> list[Any]:
    """Heap sort using Python's heapq."""
    heap = [(_item_val(item, key), index, item) for index, item in enumerate(items)]
    import heapq
    heapq.heapify(heap)
    return [heappop(heap)[2] for _ in range(len(heap))]


def binary_search(items: list[Any], key: Optional[str] = None, value: Any = None) -> int:
    """Binary search over an array pre-sorted in ascending order.
    
    Returns 0-based index of a matching item, or -1 if not found.
    Input contract: items MUST be sorted ascending by key (or element value).
    """
    low, high = 0, len(items) - 1
    while low <= high:
        middle = (low + high) // 2
        mid_val = _item_val(items[middle], key)
        if mid_val == value:
            return middle
        if mid_val < value:
            low = middle + 1
        else:
            high = middle - 1
    return -1


def sort_routes(
    routes: list[dict], key: str = "distance", algorithm: str = "merge"
) -> dict:
    if key not in {"distance", "eta", "cost", "risk", "score"}:
        raise ValueError("Unsupported route sort key.")
    if any(key not in route for route in routes):
        raise ValueError(f"Every route must contain '{key}'.")
    sorting = {"merge": merge_sort, "quick": quick_sort, "heap": heap_sort}.get(algorithm)
    if not sorting:
        raise ValueError("algorithm must be merge, quick, or heap.")
    return {"algorithm": algorithm, "key": key, "routes": sorting(routes, key)}


def optimize_projects(
    projects: list[dict], budget: int, method: str = "dp"
) -> dict:
    if budget < 0:
        raise ValueError("Budget cannot be negative.")
    prepared = _projects(projects)
    started = perf_counter()
    if method == "branch_and_bound" and len(prepared) > 32:
        raise ValueError(
            "Branch & Bound is limited to 32 projects to keep the API responsive; use dynamic programming for larger inputs."
        )
    if method == "greedy":
        selected: list[dict] = []
        cost = 0
        for item in sorted(
            prepared,
            key=lambda p: (
                -p["benefit"] / p["cost"] if p["cost"] else float("-inf"),
                p["name"],
            ),
        ):
            if cost + item["cost"] <= budget:
                selected.append(item)
                cost += item["cost"]
        metrics: dict[str, Any] = {
            "heuristic": "Greedy benefit/cost ratio. Not guaranteed optimal on 0/1 knapsack."
        }
    elif method == "dp":
        table = [[0] * (budget + 1) for _ in range(len(prepared) + 1)]
        for i, project in enumerate(prepared, 1):
            p_cost = project["cost"]
            p_ben = project["benefit"]
            for b in range(budget + 1):
                if p_cost <= b:
                    table[i][b] = max(table[i - 1][b], table[i - 1][b - p_cost] + p_ben)
                else:
                    table[i][b] = table[i - 1][b]
        selected = []
        b = budget
        for i in range(len(prepared), 0, -1):
            if table[i][b] != table[i - 1][b]:
                selected.append(prepared[i - 1])
                b -= prepared[i - 1]["cost"]
        selected.reverse()
        metrics = {
            "table_cells": (len(prepared) + 1) * (budget + 1),
            "optimal": True,
        }
    elif method == "branch_and_bound":
        selected, metrics = _branch_and_bound(prepared, budget)
    else:
        raise ValueError("method must be greedy, dp, or branch_and_bound.")
    return {
        "method": method,
        "selected_projects": selected,
        "total_cost": sum(p["cost"] for p in selected),
        "total_benefit": sum(p["benefit"] for p in selected),
        "execution_ms": round((perf_counter() - started) * 1000, 4),
        **metrics,
    }


def synthetic_graph(size: int = 12, density: float = 0.3, seed: int = 42) -> dict:
    if size < 1 or size > 500 or not (0 <= density <= 1):
        raise ValueError("size must be 1..500 and density must be 0..1.")
    rng = Random(seed)
    nodes = [str(i) for i in range(size)]
    edges = []
    for i in range(size):
        for j in range(i + 1, size):
            if rng.random() <= density:
                weight = rng.randint(1, 100)
                edges.append({
                    "source": str(i),
                    "target": str(j),
                    "distance": weight,
                    "time": weight * 1.2,
                    "cost": weight * 0.6,
                    "risk": max(1, 101 - weight),
                })
    return {"nodes": nodes, "edges": edges, "seed": seed, "density": density}


def benchmark(
    algorithm: str, size: int, density: float = 0.3, trials: int = 5, seed: int = 42
) -> dict:
    if trials < 1 or trials > 50:
        raise ValueError("trials must be between 1 and 50.")

    # Sorting & searching benchmarks
    if algorithm in {"merge_sort", "quick_sort", "heap_sort"}:
        if size < 1 or size > 50000:
            raise ValueError("size must be between 1 and 50,000 for sorting.")
        rng = Random(seed)
        base_array = [rng.randint(-100000, 100000) for _ in range(size)]
        sort_fn = {
            "merge_sort": merge_sort,
            "quick_sort": quick_sort,
            "heap_sort": heap_sort,
        }[algorithm]
        timings: list[float] = []
        for _ in range(trials):
            arr = list(base_array)
            started = perf_counter()
            sort_fn(arr)
            timings.append((perf_counter() - started) * 1000)
        ordered = sorted(timings)
        complexities = {
            "merge_sort": "O(N log N) worst & average",
            "quick_sort": "O(N log N) average, O(N²) worst",
            "heap_sort": "O(N log N) worst & average",
        }
        return {
            "algorithm": algorithm,
            "dataset": {"size": size, "type": "synthetic_integer_array", "seed": seed},
            "trials": trials,
            "median_execution_ms": round(ordered[len(ordered) // 2], 5),
            "metrics": {"items_sorted": size, "trials_run": trials},
            "theoretical_complexity": complexities[algorithm],
        }

    if algorithm == "binary_search":
        if size < 1 or size > 50000:
            raise ValueError("size must be between 1 and 50,000 for search.")
        rng = Random(seed)
        sorted_array = sorted([rng.randint(-100000, 100000) for _ in range(size)])
        timings = []
        for trial_idx in range(trials):
            target = sorted_array[(trial_idx * (size // max(1, trials))) % size]
            started = perf_counter()
            binary_search(sorted_array, None, target)
            timings.append((perf_counter() - started) * 1000)
        ordered = sorted(timings)
        return {
            "algorithm": algorithm,
            "dataset": {"size": size, "type": "sorted_integer_array", "seed": seed},
            "trials": trials,
            "median_execution_ms": round(ordered[len(ordered) // 2], 5),
            "metrics": {"items_searched": size, "target_lookup": "middle-spaced targets"},
            "theoretical_complexity": "O(log N)",
        }

    # Graph algorithms benchmark
    graph = synthetic_graph(size, density, seed)
    timings = []
    result: dict[str, Any] = {}
    for _ in range(trials):
        started = perf_counter()
        if algorithm == "bfs":
            result = bfs(graph["nodes"], graph["edges"], "0")
        elif algorithm == "dfs":
            result = dfs(graph["nodes"], graph["edges"], "0")
        elif algorithm == "dijkstra":
            result = dijkstra(graph["nodes"], graph["edges"], "0", str(size - 1))
        elif algorithm == "prim":
            result = prim(graph["nodes"], graph["edges"])
        elif algorithm == "kruskal":
            result = kruskal(graph["nodes"], graph["edges"])
        else:
            raise ValueError(f"Unsupported benchmark algorithm '{algorithm}'.")
        timings.append((perf_counter() - started) * 1000)
    ordered = sorted(timings)
    return {
        "algorithm": algorithm,
        "dataset": {**graph, "edges": len(graph["edges"])},
        "trials": trials,
        "median_execution_ms": round(ordered[len(ordered) // 2], 5),
        "metrics": {
            key: result.get(key)
            for key in ("nodes_visited", "nodes_processed", "edges_examined", "total_weight")
            if key in result
        },
        "theoretical_complexity": {
            "bfs": "O(V + E)",
            "dfs": "O(V + E)",
            "dijkstra": "O((V + E) log V)",
            "prim": "O(E log V)",
            "kruskal": "O(E log E)",
        }[algorithm],
    }


def _reconstruct(previous: dict[str, Optional[str]], target: Optional[str]) -> list[str]:
    if target is None or target not in previous:
        return []
    path = []
    curr = target
    while curr is not None:
        path.append(curr)
        curr = previous[curr]
    return list(reversed(path))


def _components(nodes: list[str], adjacency: dict) -> list[list[str]]:
    remaining, result = set(nodes), []
    while remaining:
        component, stack = set(), [next(iter(remaining))]
        while stack:
            vertex = stack.pop()
            if vertex in component:
                continue
            component.add(vertex)
            stack.extend(n for n, _ in adjacency[vertex] if n not in component)
        remaining -= component
        result.append(sorted(component))
    return sorted(result, key=lambda c: c[0] if c else "")


def _mst_result(
    algorithm: str,
    nodes: list[str],
    adjacency: dict,
    selected: list[dict],
    total: float,
    examined: int,
    started: float,
) -> dict:
    components = _components(nodes, adjacency)
    return {
        "algorithm": algorithm,
        "selected_edges": selected,
        "total_weight": total,
        "edges_selected": len(selected),
        "connected_components": components,
        "is_forest": len(components) > 1,
        "edges_examined": examined,
        "execution_ms": round((perf_counter() - started) * 1000, 4),
    }


def _projects(projects: list[dict]) -> list[dict]:
    prepared = []
    for raw in projects:
        cost, benefit = int(raw["cost"]), int(raw["benefit"])
        if cost < 0 or benefit < 0:
            raise ValueError("Project cost and benefit must be non-negative integers.")
        prepared.append({
            "name": str(raw["name"]),
            "cost": cost,
            "benefit": benefit,
            "category": raw.get("category"),
        })
    return prepared


def _branch_and_bound(projects: list[dict], budget: int) -> tuple[list[dict], dict]:
    ordered = sorted(
        projects,
        key=lambda p: p["benefit"] / p["cost"] if p["cost"] else float("inf"),
        reverse=True,
    )
    best: tuple[int, list[dict]] = (0, [])
    nodes = 0
    pruned = 0

    def bound(index: int, cost: int, benefit: int) -> float:
        remaining, estimate = budget - cost, float(benefit)
        for project in ordered[index:]:
            if project["cost"] <= remaining:
                remaining -= project["cost"]
                estimate += project["benefit"]
            elif project["cost"]:
                estimate += project["benefit"] * remaining / project["cost"]
                break
        return estimate

    def visit(index: int, cost: int, benefit: int, picked: list[dict]) -> None:
        nonlocal best, nodes, pruned
        nodes += 1
        if cost <= budget and benefit > best[0]:
            best = (benefit, picked)
        if index == len(ordered):
            return
        if bound(index, cost, benefit) <= best[0]:
            pruned += 1
            return
        project = ordered[index]
        if cost + project["cost"] <= budget:
            visit(index + 1, cost + project["cost"], benefit + project["benefit"], picked + [project])
        visit(index + 1, cost, benefit, picked)

    visit(0, 0, 0, [])
    return best[1], {"nodes_explored": nodes, "branches_pruned": pruned, "optimal": True}
