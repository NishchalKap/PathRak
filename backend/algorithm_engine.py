"""PathRak's dependency-free DAA engine.

All algorithms in this module operate on small, explicit graph and sequence formats.
They never delegate shortest-path or MST work to a routing provider: providers are
only used elsewhere to obtain real road geometry.
"""
from __future__ import annotations

from dataclasses import dataclass
from heapq import heappop, heappush
import math
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


# ─────────────────────────────────────────────────────────────────────────────
# CLRS Syllabus Algorithms: Divide-and-Conquer, Greedy, DP, Backtracking
# ─────────────────────────────────────────────────────────────────────────────

def min_max_dc(arr: list[int | float]) -> tuple[int | float, int | float, int]:
    """Divide-and-Conquer Min-Max finding.
    
    Returns (minimum, maximum, comparisons_count).
    Recurrence: T(N) = 2T(N/2) + 2 for N > 2. Uses ~ 3N/2 - 2 comparisons.
    """
    if not arr:
        raise ValueError("Array must not be empty.")
    comparisons = 0

    def _dc(low: int, high: int) -> tuple[int | float, int | float]:
        nonlocal comparisons
        if low == high:
            return arr[low], arr[low]
        if high == low + 1:
            comparisons += 1
            if arr[low] < arr[high]:
                return arr[low], arr[high]
            return arr[high], arr[low]
        mid = (low + high) // 2
        min1, max1 = _dc(low, mid)
        min2, max2 = _dc(mid + 1, high)
        comparisons += 2
        return min(min1, min2), max(max1, max2)

    min_val, max_val = _dc(0, len(arr) - 1)
    return min_val, max_val, comparisons


def fractional_knapsack(items: list[dict], capacity: float) -> dict:
    """Greedy Fractional Knapsack.
    
    Items: [{"name": str, "weight": float, "value": float}]
    Sorts by value/weight ratio descending and takes fractional fractions if needed.
    """
    if capacity < 0:
        raise ValueError("Capacity cannot be negative.")
    prepared = []
    for item in items:
        w, v = float(item["weight"]), float(item["value"])
        if w <= 0 or v < 0:
            raise ValueError("Weight must be > 0 and value >= 0.")
        prepared.append({
            "name": str(item["name"]),
            "weight": w,
            "value": v,
            "ratio": v / w,
        })
    prepared.sort(key=lambda x: x["ratio"], reverse=True)
    total_val = 0.0
    remaining = capacity
    taken = []
    for item in prepared:
        if remaining <= 0:
            break
        fraction = min(1.0, remaining / item["weight"])
        taken_w = fraction * item["weight"]
        taken_v = fraction * item["value"]
        total_val += taken_v
        remaining -= taken_w
        taken.append({
            "name": item["name"],
            "fraction": round(fraction, 4),
            "weight_taken": round(taken_w, 2),
            "value_taken": round(taken_v, 2),
        })
    return {
        "algorithm": "Fractional Knapsack (Greedy)",
        "capacity": capacity,
        "total_value": round(total_val, 4),
        "items_taken": taken,
    }


def lcs(x: str, y: str) -> dict:
    """Longest Common Subsequence using Dynamic Programming (CLRS Chapter 15).
    
    Constructs the DP table and reconstructs the LCS string.
    Time: O(m*n), Space: O(m*n).
    """
    m, n = len(x), len(y)
    table = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if x[i - 1] == y[j - 1]:
                table[i][j] = table[i - 1][j - 1] + 1
            else:
                table[i][j] = max(table[i - 1][j], table[i][j - 1])
    # Backtrack to reconstruct
    lcs_chars = []
    i, j = m, n
    while i > 0 and j > 0:
        if x[i - 1] == y[j - 1]:
            lcs_chars.append(x[i - 1])
            i -= 1
            j -= 1
        elif table[i - 1][j] >= table[i][j - 1]:
            i -= 1
        else:
            j -= 1
    lcs_str = "".join(reversed(lcs_chars))
    return {
        "algorithm": "LCS (Dynamic Programming)",
        "length": table[m][n],
        "sequence": lcs_str,
        "table_rows": m + 1,
        "table_cols": n + 1,
    }


def lis(arr: list[int | float]) -> dict:
    """Longest Increasing Subsequence using Dynamic Programming.
    
    Time: O(N^2), Space: O(N).
    """
    if not arr:
        return {"algorithm": "LIS (Dynamic Programming)", "length": 0, "sequence": []}
    n = len(arr)
    dp = [1] * n
    parent = [-1] * n
    for i in range(n):
        for j in range(i):
            if arr[j] < arr[i] and dp[j] + 1 > dp[i]:
                dp[i] = dp[j] + 1
                parent[i] = j
    max_len = max(dp)
    last_idx = dp.index(max_len)
    seq = []
    curr = last_idx
    while curr != -1:
        seq.append(arr[curr])
        curr = parent[curr]
    seq.reverse()
    return {
        "algorithm": "LIS (Dynamic Programming)",
        "length": max_len,
        "sequence": seq,
    }


def matrix_chain_order(p: list[int]) -> dict:
    """Matrix Chain Multiplication optimal parenthesization (CLRS Chapter 15).
    
    p contains dimensions such that matrix i has dimension p[i-1] x p[i].
    Time: O(n^3), Space: O(n^2).
    """
    n = len(p) - 1
    if n < 1:
        raise ValueError("At least one matrix dimension pair required (len(p) >= 2).")
    m = [[0] * (n + 1) for _ in range(n + 1)]
    s = [[0] * (n + 1) for _ in range(n + 1)]
    for l in range(2, n + 1):
        for i in range(1, n - l + 2):
            j = i + l - 1
            m[i][j] = float("inf")
            for k in range(i, j):
                q = m[i][k] + m[k + 1][j] + p[i - 1] * p[k] * p[j]
                if q < m[i][j]:
                    m[i][j] = q
                    s[i][j] = k

    def print_optimal(i: int, j: int) -> str:
        if i == j:
            return f"A{i}"
        return f"({print_optimal(i, s[i][j])} × {print_optimal(s[i][j] + 1, j)})"

    return {
        "algorithm": "Matrix Chain Order (Dynamic Programming)",
        "min_multiplications": m[1][n],
        "optimal_parenthesization": print_optimal(1, n),
        "matrices_count": n,
    }


def graph_coloring(nodes: list[str], edges: list[dict], max_colors: int) -> dict:
    """Graph Coloring using Backtracking (CLRS / Graph Theory).
    
    Finds if graph can be colored with <= max_colors such that no two adjacent
    vertices share the same color.
    """
    node_list, _, adjacency = build_graph(nodes, edges, directed=False)
    colors: dict[str, int] = {}
    nodes_order = list(node_list)

    def is_safe(v: str, c: int) -> bool:
        for neighbour, _ in adjacency[v]:
            if colors.get(neighbour) == c:
                return False
        return True

    backtrack_steps = 0

    def solve(idx: int) -> bool:
        nonlocal backtrack_steps
        if idx == len(nodes_order):
            return True
        v = nodes_order[idx]
        for c in range(1, max_colors + 1):
            if is_safe(v, c):
                colors[v] = c
                if solve(idx + 1):
                    return True
                backtrack_steps += 1
                colors.pop(v, None)
        return False

    success = solve(0)
    return {
        "algorithm": "Graph Coloring (Backtracking)",
        "colorable": success,
        "max_colors": max_colors,
        "assigned_colors": colors if success else {},
        "backtrack_steps": backtrack_steps,
    }


def n_queens(n: int) -> dict:
    """N-Queens using Backtracking.
    
    Places N non-attacking queens on an N x N chessboard.
    Returns the first solution board coordinates and total placements tested.
    """
    if n < 1 or n > 20:
        raise ValueError("N must be between 1 and 20.")
    board = [-1] * n
    steps = 0

    def is_valid(row: int, col: int) -> bool:
        for r in range(row):
            c = board[r]
            if c == col or abs(c - col) == abs(r - row):
                return False
        return True

    def place(row: int) -> bool:
        nonlocal steps
        if row == n:
            return True
        for col in range(n):
            steps += 1
            if is_valid(row, col):
                board[row] = col
                if place(row + 1):
                    return True
                board[row] = -1
        return False

    found = place(0)
    return {
        "algorithm": f"{n}-Queens (Backtracking)",
        "n": n,
        "solution_found": found,
        "board_positions": list(board) if found else [],
        "steps_explored": steps,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Step-by-Step Execution Traces for Shared Contract (Web & Pygame Studio)
# ─────────────────────────────────────────────────────────────────────────────

def record_dijkstra_trace(
    nodes: Iterable[Any],
    edges: Iterable[dict],
    start: Any,
    target: Any,
    criterion: str = "distance",
    directed: bool = False,
) -> dict:
    """Records deterministic step-by-step trace events of Dijkstra's algorithm.
    
    Event schema conforms to Section 7:
    - step: int
    - event_type: "INITIALIZE" | "POP_MIN" | "EXAMINE_EDGE" | "RELAX" | "FINALIZE" | "COMPLETE"
    - current_vertex: str
    - edge: dict | None
    - distances: dict[str, float]
    - predecessors: dict[str, str | None]
    - priority_queue: list[tuple[float, str]]
    - explanation: str
    """
    if criterion not in CRITERIA:
        raise ValueError(f"criterion must be one of {sorted(CRITERIA)}")
    node_list, materialized, adjacency = build_graph(nodes, edges, directed)
    start_s, target_s = _node(start), _node(target)
    if start_s not in adjacency or target_s not in adjacency:
        raise ValueError("Start and target must be graph vertices.")

    events = []
    step_num = 0

    distances: dict[str, float] = {n: float("inf") for n in node_list}
    distances[start_s] = 0.0
    predecessors: dict[str, Optional[str]] = {n: None for n in node_list}
    pq: list[tuple[float, str]] = [(0.0, start_s)]
    finalized: set[str] = set()

    def _json_safe_distances(d_map: dict[str, float]) -> dict[str, Optional[float]]:
        return {k: (None if math.isinf(v) else round(v, 4)) for k, v in d_map.items()}

    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "INITIALIZE",
        "current_vertex": start_s,
        "edge": None,
        "distances": _json_safe_distances(distances),
        "predecessors": dict(predecessors),
        "priority_queue": list(pq),
        "finalized": list(finalized),
        "explanation": f"Initialize distances with 0 for start vertex '{start_s}' and ∞ for all other vertices.",
    })

    reached = False
    while pq:
        d, curr = heappop(pq)
        if curr in finalized:
            continue
        finalized.add(curr)
        step_num += 1
        events.append({
            "step": step_num,
            "event_type": "POP_MIN",
            "current_vertex": curr,
            "edge": None,
            "distances": _json_safe_distances(distances),
            "predecessors": dict(predecessors),
            "priority_queue": list(pq),
            "finalized": list(finalized),
            "explanation": f"Extracted vertex '{curr}' with minimum tentative distance {d:.1f}.",
        })

        if curr == target_s:
            reached = True
            break

        for neighbour, edge in adjacency[curr]:
            w = edge.weights[criterion]
            step_num += 1
            events.append({
                "step": step_num,
                "event_type": "EXAMINE_EDGE",
                "current_vertex": curr,
                "edge": {"source": curr, "target": neighbour, "weight": w},
                "distances": _json_safe_distances(distances),
                "predecessors": dict(predecessors),
                "priority_queue": list(pq),
                "finalized": list(finalized),
                "explanation": f"Examining edge ({curr} -> {neighbour}) with weight {w:.1f}.",
            })

            new_dist = d + w
            if new_dist < distances[neighbour]:
                distances[neighbour] = new_dist
                predecessors[neighbour] = curr
                heappush(pq, (new_dist, neighbour))
                step_num += 1
                events.append({
                    "step": step_num,
                    "event_type": "RELAX",
                    "current_vertex": curr,
                    "edge": {"source": curr, "target": neighbour, "weight": w},
                    "distances": _json_safe_distances(distances),
                    "predecessors": dict(predecessors),
                    "priority_queue": list(pq),
                    "finalized": list(finalized),
                    "explanation": f"Relaxed distance to '{neighbour}' down to {new_dist:.1f} via '{curr}'.",
                })

    path = _reconstruct(predecessors, target_s) if reached else []
    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "COMPLETE",
        "current_vertex": target_s if reached else None,
        "edge": None,
        "distances": _json_safe_distances(distances),
        "predecessors": dict(predecessors),
        "priority_queue": list(pq),
        "finalized": list(finalized),
        "final_path": path,
        "total_cost": None if (not reached or math.isinf(distances[target_s])) else round(distances[target_s], 4),
        "explanation": f"Algorithm finished. Optimal path: {' -> '.join(path) if path else 'Unreachable'} (Cost: {round(distances[target_s], 2) if reached and not math.isinf(distances[target_s]) else '∞'}).",
    })

    return {
        "algorithm": "Dijkstra",
        "criterion": criterion,
        "start": start_s,
        "target": target_s,
        "nodes": node_list,
        "edges": [{"source": e.source, "target": e.target, "weight": e.weights[criterion]} for e in materialized if criterion in e.weights],
        "events": events,
        "total_steps": len(events),
        "final_path": path,
        "total_cost": distances[target_s] if reached else None,
        "reachable": reached,
    }


def record_kruskal_trace(
    nodes: Iterable[Any], edges: Iterable[dict], criterion: str = "cost"
) -> dict:
    """Records deterministic step-by-step trace events of Kruskal's algorithm."""
    node_list, materialized, _ = build_graph(nodes, edges, False)
    if criterion not in CRITERIA:
        raise ValueError("Invalid MST criterion.")
    dsu = DisjointSetUnion(node_list)
    sorted_edges = sorted(
        materialized,
        key=lambda item: (item.weights[criterion], item.source, item.target),
    )
    events = []
    step_num = 0
    selected_edges = []
    total_cost = 0.0

    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "INITIALIZE",
        "edge": None,
        "selected_edges": [],
        "dsu_components": dsu.components(),
        "total_cost": 0.0,
        "explanation": f"Initialized DSU with {len(node_list)} individual components. Sorted {len(sorted_edges)} candidate edges.",
    })

    for edge in sorted_edges:
        step_num += 1
        w = edge.weights[criterion]
        root_u = dsu.find(edge.source)
        root_v = dsu.find(edge.target)
        if root_u != root_v:
            dsu.union(edge.source, edge.target)
            selected_edges.append({"source": edge.source, "target": edge.target, "weight": w})
            total_cost += w
            events.append({
                "step": step_num,
                "event_type": "ACCEPT_EDGE",
                "edge": {"source": edge.source, "target": edge.target, "weight": w},
                "selected_edges": list(selected_edges),
                "dsu_components": dsu.components(),
                "total_cost": total_cost,
                "explanation": f"Accepted edge ({edge.source} — {edge.target}, wt {w}) connecting components '{root_u}' and '{root_v}'.",
            })
        else:
            events.append({
                "step": step_num,
                "event_type": "REJECT_EDGE",
                "edge": {"source": edge.source, "target": edge.target, "weight": w},
                "selected_edges": list(selected_edges),
                "dsu_components": dsu.components(),
                "total_cost": total_cost,
                "explanation": f"Rejected edge ({edge.source} — {edge.target}, wt {w}) to prevent cycle in component '{root_u}'.",
            })

    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "COMPLETE",
        "edge": None,
        "selected_edges": list(selected_edges),
        "dsu_components": dsu.components(),
        "total_cost": total_cost,
        "explanation": f"Kruskal's algorithm complete. Total weight: {total_cost:.1f} across {len(selected_edges)} edges.",
    })

    return {
        "algorithm": "Kruskal",
        "criterion": criterion,
        "nodes": node_list,
        "events": events,
        "total_steps": len(events),
        "selected_edges": selected_edges,
        "total_cost": total_cost,
    }

