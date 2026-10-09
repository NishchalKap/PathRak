import unittest

from algorithm_engine import (
    bfs, binary_search, dfs, dijkstra, heap_sort, kruskal, merge_sort,
    optimize_projects, prim, quick_sort, synthetic_graph,
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
    def test_bfs_is_minimum_edge_path_not_weighted_path(self):
        result = bfs(NODES, EDGES, "A", "D")
        self.assertTrue(result["reachable"])
        self.assertEqual(result["path"], ["A", "B", "D"])

    def test_dijkstra_reconstructs_lowest_weight_path(self):
        result = dijkstra(NODES, EDGES, "A", "D", "distance")
        self.assertEqual(result["path"], ["A", "B", "C", "D"])
        self.assertEqual(result["total_weight"], 4)

    def test_disconnected_graphs_are_reported_honestly(self):
        graph = [{"source": "A", "target": "B", "cost": 1}, {"source": "C", "target": "D", "cost": 2}]
        self.assertFalse(dijkstra(NODES, graph, "A", "D")["reachable"])
        self.assertTrue(prim(NODES, graph)["is_forest"])
        self.assertTrue(kruskal(NODES, graph)["is_forest"])

    def test_prim_and_kruskal_agree_on_connected_graph(self):
        self.assertEqual(prim(NODES, EDGES)["total_weight"], kruskal(NODES, EDGES)["total_weight"])

    def test_dfs_reports_components(self):
        result = dfs(NODES, [{"source": "A", "target": "B"}, {"source": "C", "target": "D"}], "A")
        self.assertEqual(len(result["connected_components"]), 2)

    def test_sorting_and_search_handle_duplicates(self):
        items = [{"id": "a", "value": 2}, {"id": "b", "value": 1}, {"id": "c", "value": 2}]
        expected = ["b", "a", "c"]
        for sorter in (merge_sort, quick_sort, heap_sort):
            self.assertEqual([item["id"] for item in sorter(items, "value")], expected)
        ordered = merge_sort(items, "value")
        self.assertGreaterEqual(binary_search(ordered, "value", 2), 1)
        self.assertEqual(binary_search(ordered, "value", 99), -1)

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

    def test_synthetic_graph_is_repeatable(self):
        self.assertEqual(synthetic_graph(10, .3, 7), synthetic_graph(10, .3, 7))


if __name__ == "__main__":
    unittest.main()
