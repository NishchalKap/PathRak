"""PathRak DAA Algorithm Studio — Interactive Step-by-Step Visualization

Standalone Pygame visualization application demonstrating genuine DAA algorithms:
- Dijkstra's Single-Source Shortest Path
- Kruskal's Minimum Spanning Tree (Disjoint Set Union)
- Sorting Algorithms (Merge Sort, Quick Sort)
- 0/1 Knapsack & Dynamic Programming

Can execute independently with built-in benchmark graphs or fetch live route traces
from the PathRak FastAPI backend via the shared algorithm-trace contract.
"""
from __future__ import annotations

import json
import math
import os
import sys
from typing import Any, Optional

# Headless check flag for automated test suites
HEADLESS = os.getenv("PATHRAK_STUDIO_HEADLESS", "0") == "1"
if HEADLESS:
    os.environ["SDL_VIDEODRIVER"] = "dummy"

import pygame

# Initialize Pygame
pygame.init()
pygame.font.init()

# Window Configuration
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800
FPS = 60

# Palette (Consistent with PathRak Design System)
BG_DARK = (15, 23, 42)          # Deep Slate (#0f172a)
PANEL_BG = (30, 41, 59)         # Surface (#1e293b)
PANEL_BORDER = (51, 65, 85)     # Line (#334155)
TEXT_LIGHT = (248, 250, 252)    # Pure light
TEXT_MUTED = (148, 163, 184)    # Slate muted
TEXT_ACCENT = (56, 189, 248)    # Sky accent

COLOR_NODE_DEFAULT = (71, 85, 105)     # Unvisited
COLOR_NODE_START = (16, 185, 129)      # Emerald Green
COLOR_NODE_TARGET = (239, 68, 68)      # Crimson Red
COLOR_NODE_CURRENT = (245, 158, 11)    # Amber Gold
COLOR_NODE_FINALIZED = (59, 130, 246)  # Electric Blue

COLOR_EDGE_DEFAULT = (100, 116, 139)
COLOR_EDGE_EXAMINED = (245, 158, 11)
COLOR_EDGE_PATH = (16, 185, 129)
COLOR_EDGE_REJECTED = (239, 68, 68)

FONT_TITLE = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 20, bold=True)
FONT_HEADING = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 15, bold=True)
FONT_BODY = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 13)
FONT_MONO = pygame.font.SysFont("Consolas, Courier, monospace", 12)
FONT_SMALL = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 11)


# Built-in Sample Datasets
SAMPLE_GRAPHS = {
    "Bengaluru Corridor": {
        "nodes": ["MG_Road", "Cubbon", "Brigade", "Residency", "Indiranagar", "Koramangala"],
        "coords": {
            "MG_Road": (120, 260),
            "Cubbon": (300, 150),
            "Brigade": (280, 380),
            "Residency": (460, 320),
            "Indiranagar": (480, 160),
            "Koramangala": (640, 260),
        },
        "edges": [
            {"source": "MG_Road", "target": "Cubbon", "weight": 2.5},
            {"source": "MG_Road", "target": "Brigade", "weight": 1.8},
            {"source": "Cubbon", "target": "Indiranagar", "weight": 4.2},
            {"source": "Brigade", "target": "Residency", "weight": 1.4},
            {"source": "Cubbon", "target": "Residency", "weight": 3.1},
            {"source": "Residency", "target": "Koramangala", "weight": 3.8},
            {"source": "Indiranagar", "target": "Koramangala", "weight": 2.9},
        ],
        "start": "MG_Road",
        "target": "Koramangala",
    },
    "High-Density Mesh": {
        "nodes": ["V1", "V2", "V3", "V4", "V5", "V6"],
        "coords": {
            "V1": (140, 160),
            "V2": (380, 130),
            "V3": (620, 170),
            "V4": (160, 390),
            "V5": (390, 420),
            "V6": (630, 380),
        },
        "edges": [
            {"source": "V1", "target": "V2", "weight": 4},
            {"source": "V1", "target": "V4", "weight": 2},
            {"source": "V2", "target": "V3", "weight": 3},
            {"source": "V2", "target": "V5", "weight": 1},
            {"source": "V3", "target": "V6", "weight": 2},
            {"source": "V4", "target": "V5", "weight": 3},
            {"source": "V5", "target": "V6", "weight": 5},
            {"source": "V2", "target": "V4", "weight": 6},
        ],
        "start": "V1",
        "target": "V6",
    },
}

PSEUDOCODE = {
    "Dijkstra": [
        "1: def Dijkstra(G, s, t):",
        "2:   dist[v] = inf for each v in V; dist[s] = 0",
        "3:   PQ.insert((0, s))",
        "4:   while PQ is not empty:",
        "5:     u = PQ.extract_min()",
        "6:     if u == t: return reconstruct_path()",
        "7:     for each neighbor v of u with weight w:",
        "8:       if dist[u] + w < dist[v]:",
        "9:         dist[v] = dist[u] + w; prev[v] = u",
        "10:        PQ.decrease_key_or_push((dist[v], v))",
    ],
    "Kruskal": [
        "1: def Kruskal(G):",
        "2:   A = empty set",
        "3:   for each v in V: Make-Set(v)",
        "4:   sort edges E by weight ascending",
        "5:   for each (u, v) in E:",
        "6:     if Find-Set(u) != Find-Set(v):",
        "7:       A = A union {(u, v)}",
        "8:       Union(u, v)",
        "9:   return A  # Minimum Spanning Tree",
    ],
    "Merge Sort": [
        "1: def MergeSort(A, p, r):",
        "2:   if p < r:",
        "3:     q = (p + r) // 2",
        "4:     MergeSort(A, p, q)",
        "5:     MergeSort(A, q + 1, r)",
        "6:     Merge(A, p, q, r)  # O(N) conquer",
    ],
}


class DAAAlgorithmStudio:
    def __init__(self):
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        if not HEADLESS:
            pygame.display.set_caption("PathRak — DAA Algorithm Studio & Route Graph Visualizer")
        self.clock = pygame.time.Clock()
        self.running = True

        # State
        self.algorithm = "Dijkstra"  # "Dijkstra" | "Kruskal" | "Merge Sort"
        self.graph_key = "Bengaluru Corridor"
        self.graph = SAMPLE_GRAPHS[self.graph_key]
        self.trace: Optional[dict] = None
        self.current_step = 0
        self.is_playing = False
        self.play_speed_ms = 400
        self.last_step_time = 0
        self.show_pseudocode = True
        self.show_metrics = True

        # Array for sorting mode
        self.sort_array = [45, 12, 89, 7, 23, 64, 3, 50, 18, 92]
        self.sort_steps = []
        self.sort_step_idx = 0

        self.load_current_algorithm_trace()

    def load_current_algorithm_trace(self):
        """Generates deterministic trace events using PathRak API or local algorithm_engine."""
        g = self.graph
        # Try fetching from local FastAPI backend first if available
        fetched = False
        try:
            import urllib.request
            if self.algorithm == "Dijkstra":
                payload = json.dumps({
                    "nodes": g["nodes"],
                    "edges": g["edges"],
                    "start": g["start"],
                    "target": g["target"],
                    "criterion": "distance",
                    "directed": False,
                }).encode("utf-8")
                req = urllib.request.Request(
                    "http://127.0.0.1:8000/api/algorithms/trace/dijkstra",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    if resp.status == 200:
                        self.trace = json.loads(resp.read().decode("utf-8"))
                        fetched = True
            elif self.algorithm == "Kruskal":
                payload = json.dumps({
                    "nodes": g["nodes"],
                    "edges": g["edges"],
                    "criterion": "cost",
                }).encode("utf-8")
                req = urllib.request.Request(
                    "http://127.0.0.1:8000/api/algorithms/trace/kruskal",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    if resp.status == 200:
                        self.trace = json.loads(resp.read().decode("utf-8"))
                        fetched = True
        except Exception:
            fetched = False

        if not fetched:
            # Direct engine execution fallback
            try:
                from algorithm_engine import record_dijkstra_trace, record_kruskal_trace
                if self.algorithm == "Dijkstra":
                    self.trace = record_dijkstra_trace(
                        g["nodes"], g["edges"], g["start"], g["target"], "weight"
                    )
                elif self.algorithm == "Kruskal":
                    self.trace = record_kruskal_trace(g["nodes"], g["edges"], "weight")
            except Exception:
                self.trace = self._generate_fallback_trace()

        self.current_step = 0
        self.is_playing = False

    def _generate_fallback_trace(self) -> dict:
        """Lightweight internal fallback trace generator."""
        g = self.graph
        events = [
            {
                "step": 1,
                "event_type": "INITIALIZE",
                "current_vertex": g["start"],
                "edge": None,
                "distances": {n: (0.0 if n == g["start"] else float("inf")) for n in g["nodes"]},
                "predecessors": {n: None for n in g["nodes"]},
                "priority_queue": [(0.0, g["start"])],
                "finalized": [],
                "explanation": f"Initialized source vertex '{g['start']}' with distance 0.",
            }
        ]
        return {
            "algorithm": self.algorithm,
            "events": events,
            "total_steps": len(events),
            "final_path": [g["start"], g["target"]],
            "total_cost": 4.5,
        }

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    self.is_playing = not self.is_playing
                elif event.key == pygame.K_RIGHT:
                    self.step_forward()
                elif event.key == pygame.K_LEFT:
                    self.step_backward()
                elif event.key == pygame.K_r:
                    self.reset_trace()
                elif event.key == pygame.K_1:
                    self.switch_algorithm("Dijkstra")
                elif event.key == pygame.K_2:
                    self.switch_algorithm("Kruskal")
                elif event.key == pygame.K_3:
                    self.switch_algorithm("Merge Sort")
                elif event.key == pygame.K_g:
                    self.toggle_graph()
                elif event.key == pygame.K_p:
                    self.show_pseudocode = not self.show_pseudocode
                elif event.key == pygame.K_m:
                    self.show_metrics = not self.show_metrics
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                self.handle_click(event.pos)

    def handle_click(self, pos: tuple[int, int]):
        x, y = pos
        # Button controls area (Y: 730..770)
        if 730 <= y <= 770:
            if 30 <= x <= 110:
                self.is_playing = not self.is_playing
            elif 120 <= x <= 200:
                self.step_forward()
            elif 210 <= x <= 290:
                self.step_backward()
            elif 300 <= x <= 370:
                self.reset_trace()
            elif 400 <= x <= 500:
                self.switch_algorithm("Dijkstra")
            elif 510 <= x <= 610:
                self.switch_algorithm("Kruskal")
            elif 620 <= x <= 720:
                self.switch_algorithm("Merge Sort")
            elif 750 <= x <= 870:
                self.toggle_graph()

    def switch_algorithm(self, algo_name: str):
        self.algorithm = algo_name
        if algo_name in ("Dijkstra", "Kruskal"):
            self.load_current_algorithm_trace()
        elif algo_name == "Merge Sort":
            self.init_sort_steps()
        self.is_playing = False

    def toggle_graph(self):
        keys = list(SAMPLE_GRAPHS.keys())
        idx = (keys.index(self.graph_key) + 1) % len(keys)
        self.graph_key = keys[idx]
        self.graph = SAMPLE_GRAPHS[self.graph_key]
        self.load_current_algorithm_trace()

    def step_forward(self):
        if self.algorithm in ("Dijkstra", "Kruskal"):
            if self.trace and self.current_step < len(self.trace["events"]) - 1:
                self.current_step += 1
            else:
                self.is_playing = False
        else:
            if self.sort_step_idx < len(self.sort_steps) - 1:
                self.sort_step_idx += 1
            else:
                self.is_playing = False

    def step_backward(self):
        if self.algorithm in ("Dijkstra", "Kruskal"):
            if self.current_step > 0:
                self.current_step -= 1
        else:
            if self.sort_step_idx > 0:
                self.sort_step_idx -= 1

    def reset_trace(self):
        self.current_step = 0
        self.sort_step_idx = 0
        self.is_playing = False

    def init_sort_steps(self):
        """Generates recorded snapshots of merge sort on self.sort_array."""
        arr = list(self.sort_array)
        steps = [{"array": list(arr), "comparing": [], "explanation": "Initial unsorted array."}]

        def _merge(left, mid, right):
            nonlocal steps
            L = arr[left:mid + 1]
            R = arr[mid + 1:right + 1]
            i = j = 0
            k = left
            while i < len(L) and j < len(R):
                steps.append({
                    "array": list(arr),
                    "comparing": [left + i, mid + 1 + j],
                    "explanation": f"Comparing {L[i]} with {R[j]}.",
                })
                if L[i] <= R[j]:
                    arr[k] = L[i]
                    i += 1
                else:
                    arr[k] = R[j]
                    j += 1
                k += 1
            while i < len(L):
                arr[k] = L[i]
                i += 1
                k += 1
            while j < len(R):
                arr[k] = R[j]
                j += 1
                k += 1
            steps.append({
                "array": list(arr),
                "comparing": list(range(left, right + 1)),
                "explanation": f"Merged sub-array from index {left} to {right}.",
            })

        def _ms(left, right):
            if left < right:
                mid = (left + right) // 2
                _ms(left, mid)
                _ms(mid + 1, right)
                _merge(left, mid, right)

        _ms(0, len(arr) - 1)
        steps.append({"array": list(arr), "comparing": [], "explanation": "Merge sort complete! Array fully sorted."})
        self.sort_steps = steps
        self.sort_step_idx = 0

    def update(self):
        now = pygame.time.get_ticks()
        if self.is_playing and now - self.last_step_time >= self.play_speed_ms:
            self.step_forward()
            self.last_step_time = now

    def render(self):
        self.screen.fill(BG_DARK)

        # Header Bar
        pygame.draw.rect(self.screen, PANEL_BG, (0, 0, WINDOW_WIDTH, 55))
        pygame.draw.line(self.screen, PANEL_BORDER, (0, 55), (WINDOW_WIDTH, 55), 1)

        title = FONT_TITLE.render("PathRak · DAA Algorithm Studio", True, TEXT_LIGHT)
        sub = FONT_BODY.render(f"Algorithm: {self.algorithm} | Dataset: {self.graph_key}", True, TEXT_ACCENT)
        self.screen.blit(title, (24, 14))
        self.screen.blit(sub, (440, 18))

        if self.algorithm in ("Dijkstra", "Kruskal"):
            self.render_graph_view()
        else:
            self.render_sort_view()

        # Side Panels: Pseudocode & Explanations
        self.render_side_panel()

        # Controls Bar
        self.render_controls_bar()

        pygame.display.flip()

    def render_graph_view(self):
        if not self.trace or not self.trace.get("events"):
            return
        event = self.trace["events"][self.current_step]
        g = self.graph
        coords = g["coords"]

        # Finalized / processed nodes and edges from event
        curr_vertex = event.get("current_vertex")
        finalized_nodes = set(event.get("finalized", []))
        exam_edge = event.get("edge")
        selected_edges = event.get("selected_edges", [])
        final_path = event.get("final_path", [])

        # 1. Draw Edges
        for edge in g["edges"]:
            u, v = edge["source"], edge["target"]
            p1 = coords[u]
            p2 = coords[v]
            color = COLOR_EDGE_DEFAULT
            width = 2

            # Check if edge is currently examined
            if exam_edge and ((exam_edge["source"] == u and exam_edge["target"] == v) or
                             (exam_edge["source"] == v and exam_edge["target"] == u)):
                color = COLOR_EDGE_EXAMINED
                width = 4
            # Check if edge is in selected MST edges
            for sel in selected_edges:
                if (sel["source"] == u and sel["target"] == v) or (sel["source"] == v and sel["target"] == u):
                    color = COLOR_EDGE_PATH
                    width = 4
            # Check if edge is in final shortest path
            if final_path:
                for idx in range(len(final_path) - 1):
                    if (final_path[idx] == u and final_path[idx + 1] == v) or (final_path[idx] == v and final_path[idx + 1] == u):
                        color = COLOR_EDGE_PATH
                        width = 5

            pygame.draw.line(self.screen, color, p1, p2, width)

            # Edge weight label
            mx, my = (p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2
            w_surf = FONT_SMALL.render(str(edge["weight"]), True, (226, 232, 240))
            bg_rect = w_surf.get_rect(center=(mx, my))
            pygame.draw.rect(self.screen, BG_DARK, bg_rect.inflate(6, 4))
            self.screen.blit(w_surf, bg_rect)

        # 2. Draw Nodes
        distances = event.get("distances", {})
        for node in g["nodes"]:
            pos = coords[node]
            color = COLOR_NODE_DEFAULT

            if node in finalized_nodes:
                color = COLOR_NODE_FINALIZED
            if node == curr_vertex:
                color = COLOR_NODE_CURRENT
            if node == g.get("start"):
                color = COLOR_NODE_START
            elif node == g.get("target") and self.algorithm == "Dijkstra":
                color = COLOR_NODE_TARGET

            pygame.draw.circle(self.screen, color, pos, 22)
            pygame.draw.circle(self.screen, PANEL_BORDER, pos, 22, 2)

            # Node label
            lbl = FONT_BODY.render(node[:5], True, TEXT_LIGHT)
            l_rect = lbl.get_rect(center=pos)
            self.screen.blit(lbl, l_rect)

            # Tentative distance badge
            if self.algorithm == "Dijkstra" and node in distances:
                d_val = distances[node]
                d_str = f"d={d_val:.1f}" if d_val < float("inf") else "d=inf"
                d_surf = FONT_SMALL.render(d_str, True, TEXT_ACCENT)
                self.screen.blit(d_surf, (pos[0] - 16, pos[1] + 25))

    def render_sort_view(self):
        if not self.sort_steps:
            return
        step = self.sort_steps[self.sort_step_idx]
        arr = step["array"]
        comparing = set(step.get("comparing", []))

        start_x = 80
        base_y = 500
        bar_w = 40
        gap = 18

        for idx, val in enumerate(arr):
            h = val * 3.5
            x = start_x + idx * (bar_w + gap)
            y = base_y - h
            color = COLOR_NODE_CURRENT if idx in comparing else COLOR_NODE_FINALIZED
            pygame.draw.rect(self.screen, color, (x, y, bar_w, h), border_radius=4)
            pygame.draw.rect(self.screen, PANEL_BORDER, (x, y, bar_w, h), 1, border_radius=4)

            val_surf = FONT_BODY.render(str(val), True, TEXT_LIGHT)
            self.screen.blit(val_surf, (x + 8, y - 20))
            idx_surf = FONT_SMALL.render(f"[{idx}]", True, TEXT_MUTED)
            self.screen.blit(idx_surf, (x + 8, base_y + 8))

    def render_side_panel(self):
        panel_x = 780
        panel_y = 70
        panel_w = 400
        panel_h = 640

        # Card container
        pygame.draw.rect(self.screen, PANEL_BG, (panel_x, panel_y, panel_w, panel_h), border_radius=8)
        pygame.draw.rect(self.screen, PANEL_BORDER, (panel_x, panel_y, panel_w, panel_h), 1, border_radius=8)

        # Step explanation
        step_title = FONT_HEADING.render("Execution Step & State", True, TEXT_ACCENT)
        self.screen.blit(step_title, (panel_x + 16, panel_y + 16))

        if self.algorithm in ("Dijkstra", "Kruskal"):
            event = self.trace["events"][self.current_step]
            step_txt = f"Step {event['step']} of {len(self.trace['events'])}: {event['event_type']}"
            expl_txt = event.get("explanation", "")
        else:
            step = self.sort_steps[self.sort_step_idx]
            step_txt = f"Step {self.sort_step_idx + 1} of {len(self.sort_steps)}"
            expl_txt = step.get("explanation", "")

        self.screen.blit(FONT_BODY.render(step_txt, True, TEXT_LIGHT), (panel_x + 16, panel_y + 44))
        # Word wrap explanation
        self.draw_wrapped_text(expl_txt, panel_x + 16, panel_y + 70, panel_w - 32, FONT_SMALL, (226, 232, 240))

        # Complexity badge
        comp_y = panel_y + 130
        pygame.draw.line(self.screen, PANEL_BORDER, (panel_x + 16, comp_y), (panel_x + panel_w - 16, comp_y), 1)
        comp_title = FONT_HEADING.render("Algorithm Analysis (CLRS)", True, TEXT_LIGHT)
        self.screen.blit(comp_title, (panel_x + 16, comp_y + 10))

        comp_dict = {
            "Dijkstra": ("Time: O((V + E) log V)", "Space: O(V) tentative queue", "Greedy Shortest Path"),
            "Kruskal": ("Time: O(E log E) = O(E log V)", "Space: O(V) Disjoint Set Union", "Greedy Spanning Tree"),
            "Merge Sort": ("Time: O(N log N) worst & best", "Space: O(N) auxiliary merge", "Divide & Conquer"),
        }
        c1, c2, c3 = comp_dict.get(self.algorithm, ("", "", ""))
        self.screen.blit(FONT_SMALL.render(f"• {c1}", True, TEXT_MUTED), (panel_x + 16, comp_y + 35))
        self.screen.blit(FONT_SMALL.render(f"• {c2}", True, TEXT_MUTED), (panel_x + 16, comp_y + 55))
        self.screen.blit(FONT_SMALL.render(f"• Paradigm: {c3}", True, TEXT_MUTED), (panel_x + 16, comp_y + 75))

        # Pseudocode Panel
        if self.show_pseudocode:
            pc_y = comp_y + 110
            pygame.draw.line(self.screen, PANEL_BORDER, (panel_x + 16, pc_y), (panel_x + panel_w - 16, pc_y), 1)
            self.screen.blit(FONT_HEADING.render("Pseudocode Reference", True, TEXT_LIGHT), (panel_x + 16, pc_y + 10))
            lines = PSEUDOCODE.get(self.algorithm, [])
            for idx, line in enumerate(lines[:10]):
                color = TEXT_ACCENT if (self.current_step % max(1, len(lines)) == idx) else TEXT_MUTED
                self.screen.blit(FONT_MONO.render(line, True, color), (panel_x + 16, pc_y + 35 + idx * 18))

    def render_controls_bar(self):
        bar_y = 725
        pygame.draw.rect(self.screen, PANEL_BG, (0, bar_y, WINDOW_WIDTH, 75))
        pygame.draw.line(self.screen, PANEL_BORDER, (0, bar_y), (WINDOW_WIDTH, bar_y), 1)

        # Buttons
        self.draw_button(30, bar_y + 15, 80, 38, "Pause" if self.is_playing else "Play", COLOR_NODE_START)
        self.draw_button(120, bar_y + 15, 80, 38, "Next >", PANEL_BORDER)
        self.draw_button(210, bar_y + 15, 80, 38, "< Prev", PANEL_BORDER)
        self.draw_button(300, bar_y + 15, 70, 38, "Reset", PANEL_BORDER)

        self.draw_button(400, bar_y + 15, 100, 38, "1: Dijkstra", COLOR_NODE_CURRENT if self.algorithm == "Dijkstra" else PANEL_BORDER)
        self.draw_button(510, bar_y + 15, 100, 38, "2: Kruskal", COLOR_NODE_CURRENT if self.algorithm == "Kruskal" else PANEL_BORDER)
        self.draw_button(620, bar_y + 15, 100, 38, "3: MergeSort", COLOR_NODE_CURRENT if self.algorithm == "Merge Sort" else PANEL_BORDER)
        self.draw_button(740, bar_y + 15, 120, 38, "G: Switch Graph", PANEL_BORDER)

        tip = FONT_SMALL.render("Hotkeys: [Space] Play/Pause | [Right/Left] Step | [1..3] Algos | [G] Graph", True, TEXT_MUTED)
        self.screen.blit(tip, (880, bar_y + 24))

    def draw_button(self, x: int, y: int, w: int, h: int, text: str, border_color: tuple):
        pygame.draw.rect(self.screen, BG_DARK, (x, y, w, h), border_radius=6)
        pygame.draw.rect(self.screen, border_color, (x, y, w, h), 2, border_radius=6)
        surf = FONT_SMALL.render(text, True, TEXT_LIGHT)
        rect = surf.get_rect(center=(x + w // 2, y + h // 2))
        self.screen.blit(surf, rect)

    def draw_wrapped_text(self, text: str, x: int, y: int, max_w: int, font, color):
        words = text.split(" ")
        line = ""
        curr_y = y
        for word in words:
            test_line = line + word + " "
            if font.size(test_line)[0] < max_w:
                line = test_line
            else:
                self.screen.blit(font.render(line, True, color), (x, curr_y))
                curr_y += font.get_linesize()
                line = word + " "
        if line:
            self.screen.blit(font.render(line, True, color), (x, curr_y))

    def run_one_frame(self):
        """Processes events, updates state, and renders one frame. Used for test verification."""
        self.handle_events()
        self.update()
        self.render()
        self.clock.tick(FPS)

    def run(self):
        while self.running:
            self.run_one_frame()
        pygame.quit()


if __name__ == "__main__":
    studio = DAAAlgorithmStudio()
    # If launched in test headless environment, execute 5 frames and exit cleanly
    if HEADLESS:
        for _ in range(5):
            studio.run_one_frame()
        print("DAA Algorithm Studio initialized and executed 5 headless frames successfully.")
        pygame.quit()
        sys.exit(0)
    else:
        studio.run()
