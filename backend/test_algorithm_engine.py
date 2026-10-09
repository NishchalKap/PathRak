import unittest

from algorithm_engine import (
    DisjointSetUnion,
    benchmark,
    bfs,
    binary_search,
    dfs,
    dijkstra,
    heap_sort,
    kruskal,
    merge_sort,
    optimize_projects,
    prim,
    quick_sort,
    synthetic_graph,
)


NODES = ["A", "B", "C", "D"]
EDGES = [
    {"source": "A", "target": "B", "distance": 2, "cost": 2},
    {"source": "A", "target": "C", "distance": 6, "cost": 6},
    {"source": "B", "target": "C", "distance": 1, "cost": 1},
    {"source": "B", "target": "D", "distance": 5, "cost": 5},
    {"source": "C", "target": "D", "distance": 1, "cost": 1},
]


class AlgorithmEngineTests(unittest.TestCase):
    def test_dsu_operations(self):
        dsu = DisjointSetUnion(["A", "B", "C", "D", "E"])
        self.assertEqual(dsu.num_components, 5)
        self.assertFalse(dsu.connected("A", "B"))

        self.assertTrue(dsu.union("A", "B"))
        self.assertTrue(dsu.connected("A", "B"))
        self.assertEqual(dsu.num_components, 4)

        self.assertTrue(dsu.union("B", "C"))
        self.assertTrue(dsu.connected("A", "C"))
        self.assertEqual(dsu.num_components, 3)

        # Redundant union returns False
        self.assertFalse(dsu.union("A", "C"))
        self.assertEqual(dsu.num_components, 3)

        # Components grouping
        comps = dsu.components()
        self.assertIn(["A", "B", "C"], comps)
        self.assertIn(["D"], comps)
        self.assertIn(["E"], comps)

    def test_bfs_is_minimum_edge_path_not_weighted_path(self):
        result = bfs(NODES, EDGES, "A", "D")
        self.assertTrue(result["reachable"])
        self.assertEqual(result["path"], ["A", "B", "D"])

    def test_dijkstra_reconstructs_lowest_weight_path(self):
        result = dijkstra(NODES, EDGES, "A", "D", "distance")
        self.assertEqual(result["path"], ["A", "B", "C", "D"])
        self.assertEqual(result["total_weight"], 4)

    def test_dijkstra_same_start_and_target(self):
        result = dijkstra(NODES, EDGES, "A", "A", "distance")
        self.assertTrue(result["reachable"])
        self.assertEqual(result["path"], ["A"])
        self.assertEqual(result["total_weight"], 0.0)

    def test_disconnected_graphs_are_reported_honestly(self):
        graph = [{"source": "A", "target": "B", "cost": 1}, {"source": "C", "target": "D", "cost": 2}]
        self.assertFalse(dijkstra(NODES, graph, "A", "D")["reachable"])
        self.assertTrue(prim(NODES, graph)["is_forest"])
        self.assertTrue(kruskal(NODES, graph)["is_forest"])

    def test_prim_and_kruskal_agree_on_connected_graph(self):
        self.assertEqual(prim(NODES, EDGES)["total_weight"], kruskal(NODES, EDGES)["total_weight"])

    def test_prim_tie_breaking_duplicate_weights(self):
        # Multiple edges with identical weights and vertices
        dup_edges = [
            {"source": "A", "target": "B", "cost": 3},
            {"source": "A", "target": "B", "cost": 3},
            {"source": "B", "target": "C", "cost": 3},
        ]
        result = prim(["A", "B", "C"], dup_edges)
        self.assertEqual(result["total_weight"], 6.0)
        self.assertEqual(result["edges_selected"], 2)

    def test_dfs_reports_components(self):
        result = dfs(NODES, [{"source": "A", "target": "B"}, {"source": "C", "target": "D"}], "A")
        self.assertEqual(len(result["connected_components"]), 2)

    def test_sorting_and_search_handle_duplicates_and_negatives(self):
        items = [{"id": "a", "value": 2}, {"id": "b", "value": -5}, {"id": "c", "value": 2}, {"id": "d", "value": 0}]
        expected = ["b", "d", "a", "c"]
        for sorter in (merge_sort, quick_sort, heap_sort):
            self.assertEqual([item["id"] for item in sorter(items, "value")], expected)
        ordered = merge_sort(items, "value")
        self.assertGreaterEqual(binary_search(ordered, "value", 2), 2)
        self.assertEqual(binary_search(ordered, "value", 99), -1)

    def test_sorting_primitives(self):
        raw = [15, -3, 0, 42, -3, 8]
        expected = [-3, -3, 0, 8, 15, 42]
        for sorter in (merge_sort, quick_sort, heap_sort):
            self.assertEqual(sorter(raw), expected)

    def test_sorting_empty_and_single(self):
        for sorter in (merge_sort, quick_sort, heap_sort):
            self.assertEqual(sorter([]), [])
            self.assertEqual(sorter([42]), [42])

    def test_binary_search_edge_cases(self):
        self.assertEqual(binary_search([], None, 5), -1)
        self.assertEqual(binary_search([-10, -5, 0, 5, 10], None, -5), 1)
        self.assertEqual(binary_search([-10, -5, 0, 5, 10], None, 12), -1)
        self.assertEqual(binary_search([-10, -5, 0, 5, 10], None, -20), -1)

    def test_knapsack_exact_methods_beat_greedy_when_needed(self):
        projects = [
            {"name": "A", "cost": 10, "benefit": 60},
            {"name": "B", "cost": 20, "benefit": 100},
            {"name": "C", "cost": 30, "benefit": 120},
        ]
        self.assertEqual(optimize_projects(projects, 50, "dp")["total_benefit"], 220)
        branch = optimize_projects(projects, 50, "branch_and_bound")
        self.assertEqual(branch["total_benefit"], 220)
        self.assertTrue(branch["optimal"])

    def test_greedy_counterexample_suboptimality(self):
        # Classic counterexample where greedy ratio is strictly inferior
        projects = [
            {"name": "A", "cost": 30, "benefit": 60},
            {"name": "B", "cost": 25, "benefit": 45},
            {"name": "C", "cost": 25, "benefit": 45},
        ]
        # Greedy chooses A (cost 30, benefit 60) -> cannot pick B or C -> total 60
        greedy = optimize_projects(projects, 50, "greedy")
        self.assertEqual(greedy["total_benefit"], 60)

        # DP & Branch & Bound choose B + C (cost 50, benefit 90)
        dp = optimize_projects(projects, 50, "dp")
        bnb = optimize_projects(projects, 50, "branch_and_bound")
        self.assertEqual(dp["total_benefit"], 90)
        self.assertEqual(bnb["total_benefit"], 90)
        self.assertGreater(dp["total_benefit"], greedy["total_benefit"])

    def test_benchmark_graph_and_sorting(self):
        # Test benchmark on graph algorithm
        b_dijkstra = benchmark("dijkstra", size=20, density=0.2, trials=3, seed=42)
        self.assertEqual(b_dijkstra["algorithm"], "dijkstra")
        self.assertGreaterEqual(b_dijkstra["median_execution_ms"], 0.0)

        # Test benchmark on sorting algorithm
        b_sort = benchmark("merge_sort", size=100, trials=3, seed=42)
        self.assertEqual(b_sort["algorithm"], "merge_sort")
        self.assertEqual(b_sort["dataset"]["size"], 100)

        # Test benchmark on binary search
        b_search = benchmark("binary_search", size=100, trials=3, seed=42)
        self.assertEqual(b_search["algorithm"], "binary_search")

    def test_synthetic_graph_is_repeatable(self):
        self.assertEqual(synthetic_graph(10, 0.3, 7), synthetic_graph(10, 0.3, 7))


if __name__ == "__main__":
    unittest.main()
