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


def bubble_sort(items: list[Any], key: Optional[str] = None) -> list[Any]:
    """Bubble sort running in O(N^2) time with early termination."""
    arr = list(items)
    n = len(arr)
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if _item_val(arr[j], key) > _item_val(arr[j + 1], key):
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr


def selection_sort(items: list[Any], key: Optional[str] = None) -> list[Any]:
    """Selection sort running in O(N^2) time."""
    arr = list(items)
    n = len(arr)
    for i in range(n):
        min_idx = i
        for j in range(i + 1, n):
            if _item_val(arr[j], key) < _item_val(arr[min_idx], key):
                min_idx = j
        if min_idx != i:
            arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr


def insertion_sort(items: list[Any], key: Optional[str] = None) -> list[Any]:
    """Insertion sort running in O(N^2) time."""
    arr = list(items)
    for i in range(1, len(arr)):
        key_elem = arr[i]
        key_val = _item_val(key_elem, key)
        j = i - 1
        while j >= 0 and _item_val(arr[j], key) > key_val:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key_elem
    return arr


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


def linear_search(items: list[Any], key: Optional[str] = None, value: Any = None) -> int:
    """Linear search sequentially scanning elements.
    
    Returns 0-based index of first occurrence, or -1 if not found.
    """
    for idx, item in enumerate(items):
        if _item_val(item, key) == value:
            return idx
    return -1


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
    sorting = {
        "merge": merge_sort,
        "quick": quick_sort,
        "heap": heap_sort,
        "bubble": bubble_sort,
        "selection": selection_sort,
        "insertion": insertion_sort,
    }.get(algorithm)
    if not sorting:
        raise ValueError("algorithm must be bubble, selection, insertion, merge, quick, or heap.")
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


def record_sort_trace(items: list[Any], algorithm: str = "merge_sort") -> dict:
    """Records deterministic step-by-step trace events of sorting algorithms."""
    algo_key = algorithm.lower().replace("-", "_").replace(" ", "_")
    if algo_key in {"bubble", "bubble_sort"}:
        canonical_name = "Bubble Sort"
        complexity = "O(N²) worst/avg, O(N) best"
    elif algo_key in {"selection", "selection_sort"}:
        canonical_name = "Selection Sort"
        complexity = "O(N²) all cases"
    elif algo_key in {"insertion", "insertion_sort"}:
        canonical_name = "Insertion Sort"
        complexity = "O(N²) worst/avg, O(N) best"
    elif algo_key in {"merge", "merge_sort"}:
        canonical_name = "Merge Sort"
        complexity = "O(N log N) all cases"
    elif algo_key in {"quick", "quick_sort"}:
        canonical_name = "Quick Sort"
        complexity = "O(N log N) avg, O(N²) worst"
    elif algo_key in {"heap", "heap_sort"}:
        canonical_name = "Heap Sort"
        complexity = "O(N log N) all cases"
    else:
        raise ValueError(f"Unsupported sorting algorithm '{algorithm}'. Must be bubble, selection, insertion, merge, quick, or heap.")

    arr = [float(x) if isinstance(x, (int, float)) else x for x in items]
    n = len(arr)
    events: list[dict] = []
    step_num = 0
    comparisons = 0
    swaps = 0

    def add_event(
        event_type: str,
        current_array: list,
        comparing: list[int] = None,
        swapped: list[int] = None,
        pivot: int = None,
        min_index: int = None,
        key_index: int = None,
        sub_range: list[int] = None,
        sorted_indices: list[int] = None,
        explanation: str = "",
    ):
        nonlocal step_num
        step_num += 1
        events.append({
            "step": step_num,
            "event_type": event_type,
            "array": list(current_array),
            "comparing": comparing or [],
            "swapped": swapped or [],
            "pivot": pivot,
            "min_index": min_index,
            "key_index": key_index,
            "range": sub_range,
            "sorted_indices": sorted_indices or [],
            "comparisons": comparisons,
            "swaps": swaps,
            "explanation": explanation,
        })

    add_event(
        "INITIALIZE",
        arr,
        explanation=f"Initialized array with {n} elements for {canonical_name}.",
    )

    if n <= 1:
        add_event(
            "COMPLETE",
            arr,
            sorted_indices=list(range(n)),
            explanation=f"{canonical_name} complete: array is sorted.",
        )
        return {
            "algorithm": canonical_name,
            "original_array": list(items),
            "final_array": list(arr),
            "comparisons": 0,
            "swaps": 0,
            "total_steps": len(events),
            "events": events,
            "theoretical_complexity": complexity,
        }

    if algo_key in {"bubble", "bubble_sort"}:
        sorted_set = set()
        for i in range(n):
            swapped_any = False
            for j in range(0, n - i - 1):
                comparisons += 1
                add_event(
                    "COMPARE",
                    arr,
                    comparing=[j, j + 1],
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Comparing element at {j} ({arr[j]}) with {j + 1} ({arr[j + 1]}).",
                )
                if arr[j] > arr[j + 1]:
                    arr[j], arr[j + 1] = arr[j + 1], arr[j]
                    swaps += 1
                    swapped_any = True
                    add_event(
                        "SWAP",
                        arr,
                        comparing=[j, j + 1],
                        swapped=[j, j + 1],
                        sorted_indices=sorted(sorted_set),
                        explanation=f"Swapped index {j} ({arr[j + 1]}) and index {j + 1} ({arr[j]}) as left was larger.",
                    )
            sorted_set.add(n - 1 - i)
            add_event(
                "SORTED_MARK",
                arr,
                sorted_indices=sorted(sorted_set),
                explanation=f"Element at index {n - 1 - i} ({arr[n - 1 - i]}) reached final sorted position.",
            )
            if not swapped_any:
                for k in range(n - i):
                    sorted_set.add(k)
                add_event(
                    "SORTED_MARK",
                    arr,
                    sorted_indices=sorted(sorted_set),
                    explanation="No swaps occurred in this pass: array is fully sorted early.",
                )
                break

    elif algo_key in {"selection", "selection_sort"}:
        sorted_set = set()
        for i in range(n):
            min_idx = i
            add_event(
                "MIN_SELECT",
                arr,
                min_index=min_idx,
                sorted_indices=sorted(sorted_set),
                explanation=f"Pass {i + 1}: initial minimum set to index {i} (value {arr[i]}).",
            )
            for j in range(i + 1, n):
                comparisons += 1
                add_event(
                    "COMPARE",
                    arr,
                    comparing=[j, min_idx],
                    min_index=min_idx,
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Comparing candidate index {j} ({arr[j]}) against current min at {min_idx} ({arr[min_idx]}).",
                )
                if arr[j] < arr[min_idx]:
                    min_idx = j
                    add_event(
                        "MIN_SELECT",
                        arr,
                        min_index=min_idx,
                        sorted_indices=sorted(sorted_set),
                        explanation=f"Updated minimum to index {min_idx} (value {arr[min_idx]}).",
                    )
            if min_idx != i:
                arr[i], arr[min_idx] = arr[min_idx], arr[i]
                swaps += 1
                add_event(
                    "SWAP",
                    arr,
                    swapped=[i, min_idx],
                    min_index=min_idx,
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Swapped minimum element {arr[i]} into sorted position {i}.",
                )
            sorted_set.add(i)
            add_event(
                "SORTED_MARK",
                arr,
                sorted_indices=sorted(sorted_set),
                explanation=f"Index {i} ({arr[i]}) finalized in sorted order.",
            )

    elif algo_key in {"insertion", "insertion_sort"}:
        sorted_set = {0}
        for i in range(1, n):
            key_val = arr[i]
            add_event(
                "INSERT_KEY",
                arr,
                key_index=i,
                sorted_indices=sorted(sorted_set),
                explanation=f"Selected key element {key_val} at index {i} for insertion.",
            )
            j = i - 1
            while j >= 0:
                comparisons += 1
                add_event(
                    "COMPARE",
                    arr,
                    comparing=[j, j + 1],
                    key_index=j + 1,
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Comparing element at {j} ({arr[j]}) with key {key_val}.",
                )
                if arr[j] > key_val:
                    arr[j + 1] = arr[j]
                    swaps += 1
                    add_event(
                        "WRITE",
                        arr,
                        swapped=[j + 1],
                        key_index=j,
                        sorted_indices=sorted(sorted_set),
                        explanation=f"Shifted {arr[j + 1]} right to position {j + 1}.",
                    )
                    j -= 1
                else:
                    break
            arr[j + 1] = key_val
            swaps += 1
            sorted_set.add(i)
            add_event(
                "WRITE",
                arr,
                swapped=[j + 1],
                key_index=j + 1,
                sorted_indices=sorted(sorted_set),
                explanation=f"Inserted key {key_val} into position {j + 1}.",
            )

    elif algo_key in {"merge", "merge_sort"}:
        def _trace_merge_sort(low: int, high: int):
            nonlocal comparisons, swaps
            if low >= high:
                return
            mid = (low + high) // 2
            add_event(
                "MERGE_RANGE",
                arr,
                sub_range=[low, high],
                explanation=f"Dividing range [{low}..{high}] into [{low}..{mid}] and [{mid + 1}..{high}].",
            )
            _trace_merge_sort(low, mid)
            _trace_merge_sort(mid + 1, high)

            left = arr[low : mid + 1]
            right = arr[mid + 1 : high + 1]
            i = j = 0
            k = low
            add_event(
                "MERGE_RANGE",
                arr,
                sub_range=[low, high],
                explanation=f"Merging sorted subarrays [{low}..{mid}] and [{mid + 1}..{high}].",
            )
            while i < len(left) and j < len(right):
                comparisons += 1
                add_event(
                    "COMPARE",
                    arr,
                    comparing=[low + i, mid + 1 + j],
                    sub_range=[low, high],
                    explanation=f"Comparing left element {left[i]} with right element {right[j]}.",
                )
                if left[i] <= right[j]:
                    arr[k] = left[i]
                    i += 1
                else:
                    arr[k] = right[j]
                    j += 1
                swaps += 1
                add_event(
                    "WRITE",
                    arr,
                    swapped=[k],
                    sub_range=[low, high],
                    explanation=f"Wrote {arr[k]} into position {k}.",
                )
                k += 1

            while i < len(left):
                arr[k] = left[i]
                swaps += 1
                i += 1
                add_event(
                    "WRITE",
                    arr,
                    swapped=[k],
                    sub_range=[low, high],
                    explanation=f"Flushed remaining left element {arr[k]} into position {k}.",
                )
                k += 1

            while j < len(right):
                arr[k] = right[j]
                swaps += 1
                j += 1
                add_event(
                    "WRITE",
                    arr,
                    swapped=[k],
                    sub_range=[low, high],
                    explanation=f"Flushed remaining right element {arr[k]} into position {k}.",
                )
                k += 1

        _trace_merge_sort(0, n - 1)

    elif algo_key in {"quick", "quick_sort"}:
        sorted_set = set()

        def _trace_quick_sort(low: int, high: int):
            nonlocal comparisons, swaps
            if low > high:
                return
            if low == high:
                sorted_set.add(low)
                add_event(
                    "SORTED_MARK",
                    arr,
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Single element at index {low} is sorted.",
                )
                return

            pivot_idx = high
            pivot_val = arr[pivot_idx]
            add_event(
                "PIVOT",
                arr,
                pivot=pivot_idx,
                sub_range=[low, high],
                sorted_indices=sorted(sorted_set),
                explanation=f"Chose pivot {pivot_val} at index {pivot_idx} for range [{low}..{high}].",
            )
            i = low - 1
            for j in range(low, high):
                comparisons += 1
                add_event(
                    "COMPARE",
                    arr,
                    comparing=[j, pivot_idx],
                    pivot=pivot_idx,
                    sub_range=[low, high],
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Comparing element at {j} ({arr[j]}) with pivot ({pivot_val}).",
                )
                if arr[j] <= pivot_val:
                    i += 1
                    if i != j:
                        arr[i], arr[j] = arr[j], arr[i]
                        swaps += 1
                        add_event(
                            "SWAP",
                            arr,
                            swapped=[i, j],
                            pivot=pivot_idx,
                            sub_range=[low, high],
                            sorted_indices=sorted(sorted_set),
                            explanation=f"Swapped index {i} and {j} to put {arr[i]} into left partition.",
                        )
            pivot_final = i + 1
            if pivot_final != high:
                arr[pivot_final], arr[high] = arr[high], arr[pivot_final]
                swaps += 1
                add_event(
                    "SWAP",
                    arr,
                    swapped=[pivot_final, high],
                    pivot=pivot_final,
                    sub_range=[low, high],
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Placed pivot {pivot_val} into permanent partition boundary at index {pivot_final}.",
                )
            sorted_set.add(pivot_final)
            add_event(
                "SORTED_MARK",
                arr,
                pivot=pivot_final,
                sorted_indices=sorted(sorted_set),
                explanation=f"Pivot {pivot_val} at index {pivot_final} is finalized.",
            )
            _trace_quick_sort(low, pivot_final - 1)
            _trace_quick_sort(pivot_final + 1, high)

        _trace_quick_sort(0, n - 1)

    elif algo_key in {"heap", "heap_sort"}:
        sorted_set = set()

        def _sift_down(start_idx: int, end_idx: int):
            nonlocal comparisons, swaps
            root = start_idx
            while True:
                child = 2 * root + 1
                if child > end_idx:
                    break
                if child + 1 <= end_idx:
                    comparisons += 1
                    add_event(
                        "COMPARE",
                        arr,
                        comparing=[child, child + 1],
                        sorted_indices=sorted(sorted_set),
                        explanation=f"Comparing left child at {child} ({arr[child]}) and right child at {child + 1} ({arr[child + 1]}).",
                    )
                    if arr[child + 1] > arr[child]:
                        child += 1
                comparisons += 1
                add_event(
                    "COMPARE",
                    arr,
                    comparing=[root, child],
                    sorted_indices=sorted(sorted_set),
                    explanation=f"Comparing heap parent at {root} ({arr[root]}) with maximum child at {child} ({arr[child]}).",
                )
                if arr[child] > arr[root]:
                    arr[root], arr[child] = arr[child], arr[root]
                    swaps += 1
                    add_event(
                        "HEAPIFY",
                        arr,
                        swapped=[root, child],
                        sorted_indices=sorted(sorted_set),
                        explanation=f"Sifted down: swapped parent {root} with child {child}.",
                    )
                    root = child
                else:
                    break

        for start_i in range((n - 2) // 2, -1, -1):
            _sift_down(start_i, n - 1)
        add_event(
            "HEAPIFY",
            arr,
            sorted_indices=sorted(sorted_set),
            explanation="Max-heap property established across array.",
        )

        for end_i in range(n - 1, 0, -1):
            arr[0], arr[end_i] = arr[end_i], arr[0]
            swaps += 1
            sorted_set.add(end_i)
            add_event(
                "SWAP",
                arr,
                swapped=[0, end_i],
                sorted_indices=sorted(sorted_set),
                explanation=f"Extracted max element {arr[end_i]} from root to index {end_i}.",
            )
            _sift_down(0, end_i - 1)

        sorted_set.add(0)

    add_event(
        "COMPLETE",
        arr,
        sorted_indices=list(range(n)),
        explanation=f"{canonical_name} completed in {step_num} steps with {comparisons} comparisons and {swaps} moves/writes.",
    )

    return {
        "algorithm": canonical_name,
        "original_array": list(items),
        "final_array": list(arr),
        "comparisons": comparisons,
        "swaps": swaps,
        "total_steps": len(events),
        "events": events,
        "theoretical_complexity": complexity,
    }


def record_search_trace(items: list[Any], value: Any, algorithm: str = "binary_search") -> dict:
    """Records deterministic step-by-step trace events of searching algorithms."""
    algo_key = algorithm.lower().replace("-", "_").replace(" ", "_")
    arr = [float(x) if isinstance(x, (int, float)) else x for x in items]
    target = float(value) if isinstance(value, (int, float)) else value
    events: list[dict] = []
    step_num = 0
    comparisons = 0

    def add_event(
        event_type: str,
        low: int = None,
        high: int = None,
        mid: int = None,
        current_index: int = None,
        found_index: int = None,
        explanation: str = "",
    ):
        nonlocal step_num
        step_num += 1
        events.append({
            "step": step_num,
            "event_type": event_type,
            "array": list(arr),
            "low": low,
            "high": high,
            "mid": mid,
            "current_index": current_index,
            "found_index": found_index,
            "target": target,
            "comparisons": comparisons,
            "explanation": explanation,
        })

    if algo_key in {"binary_search", "binary"}:
        canonical_name = "Binary Search"
        complexity = "O(log N)"
        for i in range(len(arr) - 1):
            if arr[i] > arr[i + 1]:
                raise ValueError("Array must be sorted in non-decreasing order before executing Binary Search.")

        add_event(
            "INITIALIZE",
            low=0,
            high=max(0, len(arr) - 1),
            explanation=f"Started Binary Search for target {target} across range [0..{max(0, len(arr) - 1)}].",
        )
        low, high = 0, len(arr) - 1
        found_idx = -1
        while low <= high:
            mid = (low + high) // 2
            comparisons += 1
            mid_val = arr[mid]
            add_event(
                "INSPECT",
                low=low,
                high=high,
                mid=mid,
                explanation=f"Inspecting middle index {mid} with value {mid_val} against target {target}.",
            )
            if mid_val == target:
                found_idx = mid
                add_event(
                    "FOUND",
                    low=low,
                    high=high,
                    mid=mid,
                    found_index=found_idx,
                    explanation=f"Target {target} located at index {mid}!",
                )
                break
            elif mid_val < target:
                add_event(
                    "NARROW",
                    low=mid + 1,
                    high=high,
                    mid=mid,
                    explanation=f"Target {target} > middle value {mid_val}. Narrowing search range to right subarray [{mid + 1}..{high}].",
                )
                low = mid + 1
            else:
                add_event(
                    "NARROW",
                    low=low,
                    high=mid - 1,
                    mid=mid,
                    explanation=f"Target {target} < middle value {mid_val}. Narrowing search range to left subarray [{low}..{mid - 1}].",
                )
                high = mid - 1

        if found_idx == -1:
            add_event(
                "NOT_FOUND",
                low=low,
                high=high,
                found_index=-1,
                explanation=f"Target {target} not found in array (search interval is empty).",
            )

        add_event(
            "COMPLETE",
            low=low,
            high=high,
            found_index=found_idx,
            explanation=f"Binary Search complete. Target {'found at index ' + str(found_idx) if found_idx >= 0 else 'not present'}.",
        )
        return {
            "algorithm": canonical_name,
            "array": arr,
            "target": target,
            "found": found_idx >= 0,
            "index": found_idx,
            "comparisons": comparisons,
            "total_steps": len(events),
            "events": events,
            "theoretical_complexity": complexity,
        }

    elif algo_key in {"linear_search", "linear"}:
        canonical_name = "Linear Search"
        complexity = "O(N)"
        add_event(
            "INITIALIZE",
            explanation=f"Started Linear Search for target {target} across {len(arr)} elements.",
        )
        found_idx = -1
        for idx, item in enumerate(arr):
            comparisons += 1
            add_event(
                "INSPECT",
                current_index=idx,
                explanation=f"Inspecting index {idx} (value {item}) for target {target}.",
            )
            if item == target:
                found_idx = idx
                add_event(
                    "FOUND",
                    current_index=idx,
                    found_index=idx,
                    explanation=f"Target {target} found at index {idx} after {comparisons} comparison(s)!",
                )
                break

        if found_idx == -1:
            add_event(
                "NOT_FOUND",
                found_index=-1,
                explanation=f"Target {target} not found after checking all {len(arr)} elements.",
            )

        add_event(
            "COMPLETE",
            found_index=found_idx,
            explanation=f"Linear Search complete. Target {'found at index ' + str(found_idx) if found_idx >= 0 else 'not present'}.",
        )
        return {
            "algorithm": canonical_name,
            "array": arr,
            "target": target,
            "found": found_idx >= 0,
            "index": found_idx,
            "comparisons": comparisons,
            "total_steps": len(events),
            "events": events,
            "theoretical_complexity": complexity,
        }
    else:
        raise ValueError(f"Unsupported search algorithm '{algorithm}'. Must be binary_search or linear_search.")


def record_prim_trace(nodes: Iterable[Any], edges: Iterable[dict], criterion: str = "cost") -> dict:
    """Records deterministic step-by-step trace events of Prim's algorithm."""
    node_list, _, adjacency = build_graph(nodes, edges, False)
    if criterion not in CRITERIA:
        raise ValueError("Invalid MST criterion.")
    events = []
    step_num = 0
    selected_edges = []
    total_cost = 0.0
    visited = set()
    counter = 0

    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "INITIALIZE",
        "current_vertex": node_list[0] if node_list else None,
        "visited_nodes": list(visited),
        "selected_edges": [],
        "total_cost": 0.0,
        "explanation": f"Initialized Prim's algorithm on graph with {len(node_list)} vertices.",
    })

    for root in node_list:
        if root in visited:
            continue
        visited.add(root)
        step_num += 1
        events.append({
            "step": step_num,
            "event_type": "VISIT_ROOT",
            "current_vertex": root,
            "visited_nodes": sorted(visited),
            "selected_edges": list(selected_edges),
            "total_cost": total_cost,
            "explanation": f"Started component spanning from root vertex '{root}'.",
        })
        heap: list[tuple[float, int, str, str, Edge]] = []
        for neighbour, edge in adjacency[root]:
            counter += 1
            heappush(heap, (edge.weights[criterion], counter, root, neighbour, edge))

        while heap:
            weight, _, src, tgt, edge = heappop(heap)
            step_num += 1
            if tgt in visited:
                events.append({
                    "step": step_num,
                    "event_type": "REJECT_EDGE",
                    "edge": {"source": src, "target": tgt, "weight": weight},
                    "current_vertex": tgt,
                    "visited_nodes": sorted(visited),
                    "selected_edges": list(selected_edges),
                    "total_cost": total_cost,
                    "explanation": f"Rejected edge ({src} — {tgt}, wt {weight}): target vertex '{tgt}' already visited (would form cycle).",
                })
                continue

            visited.add(tgt)
            selected_edges.append({"source": src, "target": tgt, "weight": weight})
            total_cost += weight
            events.append({
                "step": step_num,
                "event_type": "ACCEPT_EDGE",
                "edge": {"source": src, "target": tgt, "weight": weight},
                "current_vertex": tgt,
                "visited_nodes": sorted(visited),
                "selected_edges": list(selected_edges),
                "total_cost": total_cost,
                "explanation": f"Accepted minimum candidate edge ({src} — {tgt}, wt {weight}) connecting '{tgt}' into tree.",
            })

            for nxt, next_edge in adjacency[tgt]:
                if nxt not in visited:
                    counter += 1
                    heappush(heap, (next_edge.weights[criterion], counter, tgt, nxt, next_edge))

    components = _components(node_list, adjacency)
    is_forest = len(components) > 1

    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "COMPLETE",
        "current_vertex": None,
        "visited_nodes": sorted(visited),
        "selected_edges": list(selected_edges),
        "total_cost": total_cost,
        "is_forest": is_forest,
        "explanation": f"Prim's algorithm finished. {'Minimum Spanning Forest' if is_forest else 'Minimum Spanning Tree'} total weight: {total_cost:.1f} across {len(selected_edges)} edges.",
    })

    return {
        "algorithm": "Prim",
        "criterion": criterion,
        "nodes": node_list,
        "events": events,
        "total_steps": len(events),
        "selected_edges": selected_edges,
        "total_cost": total_cost,
        "is_forest": is_forest,
        "connected_components": components,
    }


def record_bfs_trace(
    nodes: Iterable[Any], edges: Iterable[dict], start: Any, target: Any | None = None, directed: bool = False
) -> dict:
    """Records deterministic step-by-step trace events of Breadth-First Search (BFS)."""
    node_list, _, adjacency = build_graph(nodes, edges, directed)
    start_s = _node(start)
    target_s = _node(target) if target is not None else None
    if start_s not in adjacency or (target_s is not None and target_s not in adjacency):
        raise ValueError("Start and target must be graph vertices.")

    events = []
    step_num = 0
    queue = [start_s]
    visited = {start_s}
    predecessor = {start_s: None}
    traversal_order = []

    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "INITIALIZE",
        "current_vertex": start_s,
        "queue": list(queue),
        "visited_nodes": sorted(visited),
        "explanation": f"Initialized BFS from start vertex '{start_s}'.",
    })

    reached = False
    while queue:
        curr = queue.pop(0)
        traversal_order.append(curr)
        step_num += 1
        events.append({
            "step": step_num,
            "event_type": "VISIT_NODE",
            "current_vertex": curr,
            "queue": list(queue),
            "visited_nodes": sorted(visited),
            "traversal_order": list(traversal_order),
            "explanation": f"Dequeued and visited vertex '{curr}'.",
        })

        if target_s and curr == target_s:
            reached = True
            break

        for neighbour, edge in adjacency[curr]:
            w = edge.weights.get("distance", edge.weights.get("cost", 1.0))
            step_num += 1
            if neighbour not in visited:
                visited.add(neighbour)
                predecessor[neighbour] = curr
                queue.append(neighbour)
                events.append({
                    "step": step_num,
                    "event_type": "ENQUEUE",
                    "current_vertex": curr,
                    "edge": {"source": curr, "target": neighbour, "weight": w},
                    "queue": list(queue),
                    "visited_nodes": sorted(visited),
                    "traversal_order": list(traversal_order),
                    "explanation": f"Discovered unvisited neighbor '{neighbour}' via edge ({curr} -> {neighbour}). Added to queue.",
                })
            else:
                events.append({
                    "step": step_num,
                    "event_type": "EXAMINE_EDGE",
                    "current_vertex": curr,
                    "edge": {"source": curr, "target": neighbour, "weight": w},
                    "queue": list(queue),
                    "visited_nodes": sorted(visited),
                    "traversal_order": list(traversal_order),
                    "explanation": f"Examined edge ({curr} -> {neighbour}): vertex '{neighbour}' already visited.",
                })

    path = _reconstruct(predecessor, target_s) if (target_s and target_s in predecessor) else []
    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "COMPLETE",
        "current_vertex": None,
        "queue": list(queue),
        "visited_nodes": sorted(visited),
        "traversal_order": list(traversal_order),
        "final_path": path,
        "explanation": f"BFS traversal complete. Visited {len(traversal_order)} vertices in order: {', '.join(traversal_order)}.",
    })

    return {
        "algorithm": "BFS",
        "start": start_s,
        "target": target_s,
        "nodes": node_list,
        "events": events,
        "total_steps": len(events),
        "traversal_order": traversal_order,
        "visited_nodes": sorted(visited),
        "path": path,
        "reachable": target_s in visited if target_s else True,
    }


def record_dfs_trace(
    nodes: Iterable[Any], edges: Iterable[dict], start: Any, directed: bool = False
) -> dict:
    """Records deterministic step-by-step trace events of Depth-First Search (DFS)."""
    node_list, _, adjacency = build_graph(nodes, edges, directed)
    start_s = _node(start)
    if start_s not in adjacency:
        raise ValueError("Start must be a graph vertex.")

    events = []
    step_num = 0
    stack = [start_s]
    visited = set()
    traversal_order = []

    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "INITIALIZE",
        "current_vertex": start_s,
        "stack": list(stack),
        "visited_nodes": sorted(visited),
        "explanation": f"Initialized DFS with start vertex '{start_s}' on stack.",
    })

    while stack:
        curr = stack.pop()
        if curr in visited:
            continue
        visited.add(curr)
        traversal_order.append(curr)
        step_num += 1
        events.append({
            "step": step_num,
            "event_type": "VISIT_NODE",
            "current_vertex": curr,
            "stack": list(stack),
            "visited_nodes": sorted(visited),
            "traversal_order": list(traversal_order),
            "explanation": f"Popped from stack and visited vertex '{curr}'.",
        })

        neighbours = adjacency[curr]
        for neighbour, edge in reversed(neighbours):
            w = edge.weights.get("distance", edge.weights.get("cost", 1.0))
            if neighbour not in visited:
                stack.append(neighbour)
                step_num += 1
                events.append({
                    "step": step_num,
                    "event_type": "PUSH_STACK",
                    "current_vertex": curr,
                    "edge": {"source": curr, "target": neighbour, "weight": w},
                    "stack": list(stack),
                    "visited_nodes": sorted(visited),
                    "traversal_order": list(traversal_order),
                    "explanation": f"Pushed unvisited neighbor '{neighbour}' onto DFS stack.",
                })

    components = _components(node_list, adjacency)
    step_num += 1
    events.append({
        "step": step_num,
        "event_type": "COMPLETE",
        "current_vertex": None,
        "stack": [],
        "visited_nodes": sorted(visited),
        "traversal_order": list(traversal_order),
        "connected_components": components,
        "explanation": f"DFS traversal complete. Visited {len(traversal_order)} vertices in order: {', '.join(traversal_order)}.",
    })

    return {
        "algorithm": "DFS",
        "start": start_s,
        "nodes": node_list,
        "events": events,
        "total_steps": len(events),
        "traversal_order": traversal_order,
        "visited_nodes": sorted(visited),
        "connected_components": components,
    }


