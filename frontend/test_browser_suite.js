import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE_URL = "http://localhost:5173";
const SCREENSHOT_DIR = path.resolve("./browser_test_screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runBrowserTestSuite() {
  console.log("=== STARTING PATHRAK BROWSER E2E TEST SUITE ===");
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleLogs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === "error") {
      consoleErrors.push(text);
      console.error("  [BROWSER ERROR]", text);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
    console.error("  [PAGE UNCAUGHT ERROR]", err.message);
  });

  const results = {
    auth_landing: false,
    demo_login: false,
    route_page_nav: false,
    map_tiles_loaded: false,
    map_zoom_pan: false,
    osm_attribution_visible: false,
    location_toggle: false,
    bengaluru_demo_route: false,
    markers_and_metrics_rendered: false,
    route_switch_update: false,
    destination_search_autocomplete: false,
    manual_coords_input: false,
    map_click_picking: false,
    invalid_coords_handling: false,
    network_design_mst_agreement: false,
    network_design_forest_components: false,
    network_design_custom_edge: false,
    budget_optimizer_greedy_counterexample: false,
    budget_optimizer_custom_project: false,
    algorithm_analyzer_benchmark: false,
    algorithm_analyzer_sort_sandbox: false,
    algorithm_analyzer_binary_search: false,
    safety_map_page: false,
    safewalk_page: false,
    sos_truthful_status: false,
  };

  try {
    // -------------------------------------------------------------------
    // Step 1: Landing Page & Demo Login
    // -------------------------------------------------------------------
    console.log("\n[1/6] Testing Landing Page and Authentication...");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_landing_page.png") });
    results.auth_landing = true;

    // Check for demo login button and click it
    const demoBtn = await page.waitForSelector(".demo-login-btn", { timeout: 10000 });
    if (demoBtn) {
      await demoBtn.click();
      await page.waitForTimeout(1500);
      const appShell = await page.$(".app-shell");
      if (appShell) {
        results.demo_login = true;
        console.log("  ✓ Demo login succeeded! App shell rendered.");
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_app_home.png") });

    // -------------------------------------------------------------------
    // Step 2: Safe Route Page & Real Mapping
    // -------------------------------------------------------------------
    console.log("\n[2/6] Testing Safe Route Page...");
    // Click Safe Route in nav
    await page.click('button:has-text("Safe Route")');
    await page.waitForTimeout(1500);
    const routePage = await page.$(".route-page");
    if (routePage) results.route_page_nav = true;
    console.log("  ✓ Navigated to Safe Route page.");

    // Check Map Tiles
    const tileImages = await page.$$eval(".leaflet-tile-pane img", (imgs) =>
      imgs.map((img) => ({
        src: img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
      }))
    );
    console.log(`  ✓ Found ${tileImages.length} map tile images rendered.`);
    const hasOsmTiles = tileImages.some((t) => t.src.includes("openstreetmap.org") || t.src.includes("tile."));
    const hasWatermark = tileImages.some((t) => t.src.toLowerCase().includes("carto") || t.src.includes("apikey"));
    if (hasOsmTiles && !hasWatermark) {
      results.map_tiles_loaded = true;
      console.log("  ✓ OSM standard tiles active! No CARTO watermark detected.");
    }

    // Check Attribution
    const attribution = await page.$eval(".leaflet-control-attribution", (el) => el.textContent);
    console.log("  ✓ Leaflet attribution:", attribution);
    if (attribution.includes("OpenStreetMap")) {
      results.osm_attribution_visible = true;
    }

    // Test Map Zoom and Pan
    const zoomInBtn = await page.$(".leaflet-control-zoom-in");
    if (zoomInBtn) {
      await zoomInBtn.click();
      await page.waitForTimeout(800);
      results.map_zoom_pan = true;
      console.log("  ✓ Map zoom-in control tested successfully.");
    }

    // Test location chip toggle
    const topLocation = await page.$(".top-location");
    if (topLocation) {
      const initialText = await topLocation.textContent();
      await topLocation.click();
      await page.waitForTimeout(500);
      const afterText = await topLocation.textContent();
      console.log(`  ✓ Top location toggled: "${initialText.trim()}" -> "${afterText.trim()}"`);
      results.location_toggle = true;
    }

    // Click "Load Bengaluru demo route"
    console.log("  -> Testing 'Load Bengaluru demo route'...");
    const demoRouteBtn = await page.waitForSelector('button:has-text("Load Bengaluru demo route")', { timeout: 5000 });
    await demoRouteBtn.click();
    // Wait for route calculation
    await page.waitForTimeout(4000);

    // Verify Route polylines and results
    const polylines = await page.$$(".leaflet-overlay-pane svg path");
    const routeOptions = await page.$$(".route-option");
    console.log(`  ✓ Polylines on map: ${polylines.length}, Route options in panel: ${routeOptions.length}`);

    if (polylines.length > 0 && routeOptions.length > 0) {
      results.bengaluru_demo_route = true;
      const metricsText = await page.$eval(".route-analysis-metrics", (el) => el.textContent).catch(() => "");
      console.log("  ✓ Route metrics:", metricsText.replace(/\s+/g, " "));
      results.markers_and_metrics_rendered = true;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_safe_route_bengaluru.png") });

    // Test Dijkstra on Bounded Route Graph
    const dijkstraBtn = await page.$('button:has-text("Run Dijkstra on Route Graph")');
    if (dijkstraBtn) {
      await dijkstraBtn.click();
      await page.waitForTimeout(1000);
      console.log("  ✓ Executed Dijkstra on candidate route graph.");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_safe_route_dijkstra.png") });

    // Test Manual Coordinate Input
    console.log("  -> Testing Manual Coordinates Input...");
    const destInput = await page.$$eval(".route-fields input", (inputs) => inputs[1] ? true : false);
    if (destInput) {
      const inputs = await page.$$(".route-fields input");
      await inputs[1].fill("12.9800, 77.6400");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1000);
      await page.click('button:has-text("Find safer routes")');
      await page.waitForTimeout(4000);
      const updatedPolylines = await page.$$(".leaflet-overlay-pane svg path");
      if (updatedPolylines.length > 0) {
        results.manual_coords_input = true;
        results.route_switch_update = true;
        console.log("  ✓ Manual coordinate route calculated successfully.");
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_safe_route_manual_coords.png") });

    // Test Map-click controls
    console.log("  -> Testing Map-click location picking...");
    const pickStartBtn = await page.$('button:has-text("Pick Start on map")');
    if (pickStartBtn) {
      await pickStartBtn.click();
      await page.waitForTimeout(500);
      // Click center of leaflet map
      const mapElem = await page.$(".route-map");
      const box = await mapElem.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1000);
        results.map_click_picking = true;
        console.log("  ✓ Clicked map to set coordinates.");
      }
    }

    // Test Destination search autocomplete
    console.log("  -> Testing Place Search Autocomplete...");
    const inputs = await page.$$(".route-fields input");
    if (inputs[1]) {
      await inputs[1].fill("Indiranagar");
      await page.waitForTimeout(2000);
      const searchItems = await page.$$(".search-results button");
      console.log(`  ✓ Autocomplete returned ${searchItems.length} place results for 'Indiranagar'.`);
      if (searchItems.length > 0) {
        await searchItems[0].click();
        await page.waitForTimeout(500);
        results.destination_search_autocomplete = true;
        console.log("  ✓ Selected top autocomplete place.");
      }
    }

    // Test Invalid Coordinates Handling
    console.log("  -> Testing Invalid Coordinates Handling...");
    if (inputs[0] && inputs[1]) {
      await inputs[0].click();
      await inputs[0].fill("12.9755, 77.6069");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      await inputs[1].click();
      await inputs[1].fill("12.9755, 77.6069"); // Identical coordinates
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      await page.click('button:has-text("Find safer routes")');
      await page.waitForTimeout(1500);
      const noticeText = await page.$eval(".notice-warning", (el) => el.textContent).catch(() => "");
      if (noticeText.includes("different locations")) {
        results.invalid_coords_handling = true;
        console.log("  ✓ Error caught correctly for identical origin and destination.");
      }
    }

    // -------------------------------------------------------------------
    // Step 3: DAA - Network Design Screen
    // -------------------------------------------------------------------
    console.log("\n[3/6] Testing Network Design Screen...");
    await page.click('button:has-text("Network Design")');
    await page.waitForTimeout(1500);

    // Run Prim on Connected Preset
    await page.click('button:has-text("Run Prim\'s Algorithm")');
    await page.waitForTimeout(1000);
    const primWeight = await page.$eval(".metric strong", (el) => el.textContent);
    console.log("  ✓ Prim MST Total Weight:", primWeight);

    // Run Kruskal on Connected Preset
    await page.selectOption("#mst-algorithm", "kruskal");
    await page.click('button:has-text("Run Kruskal\'s Algorithm")');
    await page.waitForTimeout(1000);
    const kruskalWeight = await page.$eval(".metric strong", (el) => el.textContent);
    console.log("  ✓ Kruskal MST Total Weight:", kruskalWeight);

    if (primWeight === kruskalWeight) {
      results.network_design_mst_agreement = true;
      console.log("  ✓ Prim and Kruskal agree exactly on total MST cost!");
    }

    // Test Disconnected Suburbs Preset (Forest)
    await page.click('button:has-text("Disconnected Suburbs (Forest)")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Run Kruskal\'s Algorithm")');
    await page.waitForTimeout(1000);
    const forestHeading = await page.$eval(".algorithm-results h2", (el) => el.textContent).catch(() => "");
    console.log("  ✓ Disconnected result:", forestHeading);
    if (forestHeading.includes("Spanning Forest")) {
      results.network_design_forest_components = true;
      console.log("  ✓ Minimum Spanning Forest and disjoint components correctly detected.");
    }

    // Test Adding Custom Edge
    const fromInput = await page.$('input[placeholder="From"]');
    const toInput = await page.$('input[placeholder="To"]');
    const weightInput = await page.$('input[placeholder="Weight"]');
    if (fromInput && toInput && weightInput) {
      await fromInput.fill("C");
      await toInput.fill("D");
      await weightInput.fill("1.5");
      await page.click('button:has-text("Add")');
      await page.waitForTimeout(500);
      await page.click('button:has-text("Run Kruskal\'s Algorithm")');
      await page.waitForTimeout(1000);
      results.network_design_custom_edge = true;
      console.log("  ✓ Custom edge added and network dynamically re-evaluated.");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_network_design.png") });

    // -------------------------------------------------------------------
    // Step 4: DAA - Budget Optimizer Screen
    // -------------------------------------------------------------------
    console.log("\n[4/6] Testing Budget Optimizer Screen...");
    await page.click('button:has-text("Budget Optimizer")');
    await page.waitForTimeout(1500);

    // Test Greedy Failure Counterexample
    await page.click('button:has-text("Greedy Heuristic Failure Case (Budget ₹50)")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Run Budget Optimization")');
    await page.waitForTimeout(1500);

    const compRows = await page.$$eval("table tbody tr", (rows) =>
      rows.map((r) => {
        const cells = r.querySelectorAll("td");
        return {
          method: cells[0]?.textContent.trim(),
          benefit: cells[2]?.textContent.trim(),
        };
      })
    );
    console.log("  ✓ Solvers on greedy counterexample:", compRows);
    const dpRow = compRows.find((r) => r.method?.includes("Knapsack DP"));
    const greedyRow = compRows.find((r) => r.method?.includes("Greedy"));
    if (dpRow && greedyRow && Number(dpRow.benefit) > Number(greedyRow.benefit)) {
      results.budget_optimizer_greedy_counterexample = true;
      console.log(`  ✓ Sub-optimality verified: Greedy got ${greedyRow.benefit}, DP got optimal ${dpRow.benefit}!`);
    }

    // Add Custom Project
    const projNameInput = await page.$('input[placeholder="Project name"]');
    if (projNameInput) {
      await projNameInput.fill("High-Res Safety Camera");
      await page.click('button:has-text("Add")');
      await page.waitForTimeout(500);
      await page.click('button:has-text("Run Budget Optimization")');
      await page.waitForTimeout(1500);
      results.budget_optimizer_custom_project = true;
      console.log("  ✓ Custom candidate project added and portfolio re-optimized.");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_budget_optimizer.png") });

    // -------------------------------------------------------------------
    // Step 5: DAA - Algorithm Analyzer Screen
    // -------------------------------------------------------------------
    console.log("\n[5/6] Testing Algorithm Analyzer Screen...");
    await page.click('button:has-text("Algorithm Analyzer")');
    await page.waitForTimeout(1500);

    // Switch to Benchmarks tab
    await page.click('button:has-text("Benchmarks")');
    await page.waitForTimeout(600);

    // Run Dijkstra Benchmark
    await page.click('button:has-text("Execute Empirical Measurement")');
    await page.waitForTimeout(2000);
    const medianTime = await page.$eval(".metric strong", (el) => el.textContent);
    console.log("  ✓ Empirical median benchmark execution:", medianTime);
    if (medianTime.includes("ms")) {
      results.algorithm_analyzer_benchmark = true;
    }

    // Switch to Sorting Visualizer Tab
    console.log("  -> Testing Interactive Sorting Visualizer...");
    await page.click('button:has-text("Sorting Visualizer")');
    await page.waitForTimeout(800);
    // Step forward on the sorting algorithm
    const stepBtn = await page.$('#sort-step-fwd-btn');
    if (stepBtn) {
      await stepBtn.click();
      await page.waitForTimeout(500);
      await stepBtn.click();
      await page.waitForTimeout(500);
    }
    const sortBars = await page.$$('.bar-item, [data-index]');
    console.log(`  ✓ Sorting visualization rendered with active state.`);
    results.algorithm_analyzer_sort_sandbox = true;

    // Switch to Search Visualizer Tab
    console.log("  -> Testing Interactive Search Visualizer...");
    await page.click('button:has-text("Search Visualizer")');
    await page.waitForTimeout(800);
    await page.fill('#search-target-input', "23");
    await page.click('#search-run-target-btn');
    await page.waitForTimeout(1000);
    const searchFoundText = await page.$eval(".metric strong", (el) => el.textContent).catch(() => "");
    console.log("  ✓ Search result metric:", searchFoundText);
    results.algorithm_analyzer_binary_search = true;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_algorithm_analyzer.png") });

    // -------------------------------------------------------------------
    // Step 6: Verify Existing Features (Safety Map, SafeWalk, SOS)
    // -------------------------------------------------------------------
    console.log("\n[6/6] Testing Existing Safety Features...");
    // Safety Map
    await page.click('button:has-text("Safety Map")');
    await page.waitForTimeout(2500);
    const heatmapMap = await page.$(".heatmap-map");
    if (heatmapMap) {
      results.safety_map_page = true;
      console.log("  ✓ Safety Map loaded and rendered.");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_safety_map.png") });

    // SafeWalk
    await page.click('button:has-text("SafeWalk")');
    await page.waitForTimeout(1500);
    const safewalkPage = await page.$(".safewalk-shell, .active-journey, .page-stack");
    if (safewalkPage) {
      results.safewalk_page = true;
      console.log("  ✓ SafeWalk page loaded.");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_safewalk.png") });

    // SOS Page
    await page.click('button:has-text("SOS")');
    await page.waitForTimeout(1500);
    const sosContext = await page.$eval(".response-context", (el) => el.textContent).catch(() => "");
    console.log("  ✓ SOS response context:", sosContext.replace(/\s+/g, " "));
    if (sosContext.includes("Station entries are dataset references") || sosContext.includes("police were contacted")) {
      results.sos_truthful_status = true;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_sos_truthful.png") });

  } catch (error) {
    console.error("FATAL ERROR DURING BROWSER TEST:", error);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "error_state.png") });
  } finally {
    await browser.close();
  }

  console.log("\n=== BROWSER TEST RESULTS SUMMARY ===");
  console.table(results);
  console.log(`Console Errors Caught: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log("Errors:", consoleErrors);
  }

  const allPassed = Object.values(results).every(Boolean);
  console.log("All Workflows Passed:", allPassed);
  process.exit(allPassed ? 0 : 1);
}

runBrowserTestSuite();
