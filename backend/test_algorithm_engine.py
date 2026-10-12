import unittest

from algorithm_engine import (
    DisjointSetUnion,
    benchmark,
    bfs,
    binary_search,
    dfs,
    dijkstra,
    fractional_knapsack,
    graph_coloring,
    heap_sort,
    kruskal,
    lcs,
    lis,
    matrix_chain_order,
    merge_sort,
    min_max_dc,
    n_queens,
    optimize_projects,
    prim,
    quick_sort,
    record_dijkstra_trace,
    record_kruskal_trace,
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

    def test_min_max_dc(self):
        arr = [3, 9, -2, 14, 0, 8, 22, -10]
        min_v, max_v, comps = min_max_dc(arr)
        self.assertEqual(min_v, -10)
        self.assertEqual(max_v, 22)
        self.assertLess(comps, 2 * len(arr))

    def test_fractional_knapsack(self):
        items = [
            {"name": "gold", "weight": 10, "value": 60},    # ratio 6
            {"name": "silver", "weight": 20, "value": 100}, # ratio 5
            {"name": "bronze", "weight": 30, "value": 120}, # ratio 4
        ]
        # Capacity 50: take gold (10, 60), silver (20, 100), and 20/30 of bronze (20, 80) -> 240
        res = fractional_knapsack(items, 50)
        self.assertEqual(res["total_value"], 240.0)
        self.assertEqual(len(res["items_taken"]), 3)
        self.assertAlmostEqual(res["items_taken"][2]["fraction"], 2/3, places=2)

    def test_lcs(self):
        res = lcs("ABCBDAB", "BDCAB")
        self.assertEqual(res["length"], 4)
        self.assertIn(res["sequence"], ["BCAB", "BDAB"])

    def test_lis(self):
        res = lis([10, 22, 9, 33, 21, 50, 41, 60, 80])
        self.assertEqual(res["length"], 6)
        self.assertEqual(res["sequence"], [10, 22, 33, 50, 60, 80])

    def test_matrix_chain_order(self):
        # Dimensions: 10x20, 20x30, 30x40
        res = matrix_chain_order([10, 20, 30, 40])
        # Optimal parenthesization: ((A1 x A2) x A3) -> 10*20*30 + 10*30*40 = 6000 + 12000 = 18000
        self.assertEqual(res["min_multiplications"], 18000)
        self.assertIn("A1", res["optimal_parenthesization"])

    def test_graph_coloring(self):
        # 3-cycle triangle needs 3 colors, cannot be colored with 2
        nodes = ["A", "B", "C"]
        edges = [
            {"source": "A", "target": "B"},
            {"source": "B", "target": "C"},
            {"source": "A", "target": "C"},
        ]
        fail_res = graph_coloring(nodes, edges, max_colors=2)
        self.assertFalse(fail_res["colorable"])
        pass_res = graph_coloring(nodes, edges, max_colors=3)
        self.assertTrue(pass_res["colorable"])
        self.assertEqual(len(pass_res["assigned_colors"]), 3)

    def test_n_queens(self):
        res4 = n_queens(4)
        self.assertTrue(res4["solution_found"])
        self.assertEqual(len(res4["board_positions"]), 4)
        # Check no two queens attack
        board = res4["board_positions"]
        for r1 in range(4):
            for r2 in range(r1 + 1, 4):
                self.assertNotEqual(board[r1], board[r2])
                self.assertNotEqual(abs(board[r1] - board[r2]), abs(r1 - r2))

    def test_dijkstra_trace_recording(self):
        trace = record_dijkstra_trace(NODES, EDGES, "A", "D", "distance")
        self.assertEqual(trace["algorithm"], "Dijkstra")
        self.assertTrue(trace["reachable"])
        self.assertEqual(trace["final_path"], ["A", "B", "C", "D"])
        self.assertEqual(trace["total_cost"], 4.0)
        self.assertGreater(trace["total_steps"], 5)
        # Check event structure
        first_event = trace["events"][0]
        self.assertEqual(first_event["event_type"], "INITIALIZE")
        self.assertIn("distances", first_event)
        self.assertIn("predecessors", first_event)
        last_event = trace["events"][-1]
        self.assertEqual(last_event["event_type"], "COMPLETE")

    def test_kruskal_trace_recording(self):
        trace = record_kruskal_trace(NODES, EDGES, "cost")
        self.assertEqual(trace["algorithm"], "Kruskal")
        self.assertEqual(trace["total_cost"], 4.0)
        self.assertEqual(len(trace["selected_edges"]), 3)
        self.assertGreater(trace["total_steps"], 3)
        first_event = trace["events"][0]
        self.assertEqual(first_event["event_type"], "INITIALIZE")
        last_event = trace["events"][-1]
        self.assertEqual(last_event["event_type"], "COMPLETE")


if __name__ == "__main__":
    unittest.main()
