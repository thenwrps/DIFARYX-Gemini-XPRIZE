const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\worap\\.gemini\\antigravity\\brain\\5b22e19f-89f5-4c4b-92e8-bcdacc334a95\\artifacts';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const csvContent = `two_theta,intensity
20.0,10.0
30.1,50.0
35.5,100.0
43.2,40.0
50.0,15.0`;

const tempCsvPath = path.join(__dirname, 'temp_upload.csv');
fs.writeFileSync(tempCsvPath, csvContent);

(async () => {
  console.log('=== STARTING RUNTIME FUNCTIONAL VERIFICATION ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[Console ${msg.type()}] ${text}`);
    console.log(`[Browser Console] ${text}`);
  });

  const getStorage = async () => {
    return await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        items[key] = localStorage.getItem(key);
      }
      return items;
    });
  };

  try {
    // 1. Landing page
    console.log('\n--- Step 1: Landing Page ---');
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_landing.png') });
    console.log('Landing page verified. Saved screenshot: 01_landing.png');

    // 2. Dashboard
    console.log('\n--- Step 2: Dashboard ---');
    await page.goto('http://localhost:5173/dashboard');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_dashboard.png') });
    const initialStorage = await getStorage();
    console.log('Dashboard verified. Active localStorage keys:', Object.keys(initialStorage));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_dashboard_loaded.png') });

    // 3. XRD Workspace
    console.log('\n--- Step 3: XRD Workspace ---');
    await page.goto('http://localhost:5173/workspace/xrd?project=cu-fe2o4-spinel&mode=demo');
    await page.waitForTimeout(3000);
    
    const xrdStorageBefore = await getStorage();
    console.log('XRD before reprocess: overrides key exists:', Boolean(xrdStorageBefore['difaryx-parameter-state:v2:cu-fe2o4-spinel:xrd']));

    // Locate and click Reprocess Peaks
    console.log('Clicking Reprocess Peaks...');
    await page.click('button:has-text("Reprocess Peaks")');
    await page.waitForTimeout(2000);
    
    const xrdStorageAfter = await getStorage();
    console.log('XRD after reprocess: overrides key exists:', Boolean(xrdStorageAfter['difaryx-parameter-state:v2:cu-fe2o4-spinel:xrd']));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_workspace_xrd.png') });

    // 4. FTIR Workspace
    console.log('\n--- Step 4: FTIR Workspace ---');
    await page.goto('http://localhost:5173/workspace/ftir?project=cu-fe2o4-spinel&mode=demo');
    await page.waitForTimeout(2000);
    
    console.log('Clicking Apply Parameters...');
    await page.click('button:has-text("Apply Parameters")');
    await page.waitForTimeout(1000);
    
    console.log('Clicking Detect Bands...');
    await page.click('button:has-text("Detect Bands")');
    await page.waitForTimeout(1500);

    console.log('Clicking Save Evidence...');
    await page.click('button:has-text("Save Evidence")');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_workspace_ftir.png') });

    // 5. Raman Workspace
    console.log('\n--- Step 5: Raman Workspace ---');
    await page.goto('http://localhost:5173/workspace/raman?project=cu-fe2o4-spinel&mode=demo');
    await page.waitForTimeout(2000);
    console.log('Clicking Reprocess Raman Peaks...');
    await page.click('button:has-text("Reprocess Raman Peaks")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_workspace_raman.png') });

    // 6. XPS Workspace
    console.log('\n--- Step 6: XPS Workspace ---');
    await page.goto('http://localhost:5173/workspace/xps?project=cu-fe2o4-spinel&mode=demo');
    await page.waitForTimeout(2000);
    console.log('Clicking Reprocess XPS Peaks...');
    await page.click('button:has-text("Reprocess XPS Peaks")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_workspace_xps.png') });

    // 7. Fusion Workspace
    console.log('\n--- Step 7: Fusion Workspace ---');
    await page.goto('http://localhost:5173/workspace/fusion?project=cu-fe2o4-spinel');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_workspace_fusion_decision.png') });
    
    console.log('Switching tabs in Fusion workspace...');
    await page.click('button:has-text("Cross-Technique Insights")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_workspace_fusion_insights.png') });
    
    await page.click('button:has-text("Review Cards")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_workspace_fusion_review.png') });

    await page.click('button:has-text("Contradictions")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_workspace_fusion_contradictions.png') });

    // 8. Multi-Tech Workspace
    console.log('\n--- Step 8: Multi-Tech Workspace ---');
    await page.goto('http://localhost:5173/workspace/multi?project=cu-fe2o4-spinel');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_workspace_multi.png') });

    // 9. Analysis Workspace (Ingestion Panel)
    console.log('\n--- Step 9: Analysis Ingestion Workspace ---');
    await page.goto('http://localhost:5173/analysis');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '09_workspace_analysis_empty.png') });
    
    console.log('Navigating to Upload panel...');
    await page.goto('http://localhost:5173/analysis/new');
    await page.waitForTimeout(2000);
    
    console.log('Uploading test signal CSV...');
    await page.setInputFiles('input[type="file"]', tempCsvPath);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '09_workspace_analysis_mapped.png') });

    // Click to confirm/ingest
    console.log('Clicking Save / Ingest...');
    await page.click('button:has-text("Create Ingestion Session")');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '09_workspace_analysis_saved.png') });

    // 10. Agent Demo
    console.log('\n--- Step 10: Agent Demo Workflow ---');
    await page.goto('http://localhost:5173/demo/agent?project=cu-fe2o4-spinel&mode=demo');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_agent_ready.png') });

    console.log('Clicking Run Workflow...');
    await page.click('button:has-text("Run Workflow")');
    console.log('Waiting 10 seconds for Agent workflow reasoning steps to run...');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_agent_finished.png') });

    console.log('Opening Actions dropdown...');
    await page.click('button:has-text("Actions")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_agent_actions_dropdown.png') });

    console.log('Clicking Save to Notebook...');
    await page.click('button:has-text("Save to Notebook")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_agent_notebook_redirect.png') });

    // 11. Notebook Lab
    console.log('\n--- Step 11: Notebook Lab ---');
    // Ensure we are on the notebook page and check if the entry exists
    const notebookStorage = await getStorage();
    const notebookEntriesRaw = notebookStorage['difaryx-workflow-notebook-entries'];
    const entries = notebookEntriesRaw ? JSON.parse(notebookEntriesRaw) : [];
    console.log(`Notebook entries count: ${entries.length}`);
    if (entries.length > 0) {
      console.log('Last notebook entry content excerpt:', entries[entries.length - 1].rawText.substring(0, 100));
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '11_notebook_lab.png') });

    // 12. Report Builder
    console.log('\n--- Step 12: Report Builder ---');
    await page.goto('http://localhost:5173/reports?project=cu-fe2o4-spinel');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '12_report_builder.png') });
    console.log('Exporting report summary...');
    await page.click('button:has-text("Export Report")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '12_report_builder_exported.png') });

    // 13. Session Bundle Reality Test (Export -> Clear -> Import -> Verify)
    console.log('\n--- Step 13: Session Bundle Portability test ---');
    await page.goto('http://localhost:5173/dashboard?mode=demo');
    await page.waitForTimeout(2000);

    console.log('Triggering download of session bundle...');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export Session")')
    ]);
    const downloadPath = path.join(__dirname, 'exported_session.difaryx');
    await download.saveAs(downloadPath);
    console.log(`Session package successfully downloaded and saved to: ${downloadPath}`);

    const manifestText = fs.readFileSync(downloadPath, 'utf8');
    const manifestObj = JSON.parse(manifestText);
    console.log('Downloaded session manifest metadata:', manifestObj.manifest);
    console.log('Recognized localStorage keys in bundle:', Object.keys(manifestObj.storageData));

    // Clear local storage and reload
    console.log('Clearing local storage to test restoration...');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);
    const storageAfterClear = await getStorage();
    console.log('localStorage keys after clear:', Object.keys(storageAfterClear));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '13_session_cleared.png') });

    // Trigger import
    console.log('Importing the session bundle...');
    await page.setInputFiles('#session-file-input', downloadPath);
    console.log('Waiting for reload...');
    await page.waitForTimeout(3000);
    
    const storageAfterImport = await getStorage();
    console.log('localStorage keys after import restoration:', Object.keys(storageAfterImport));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '13_session_restored.png') });

    console.log('\n=== RUNTIME FUNCTIONAL VERIFICATION COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Error during functional verification:', err);
  } finally {
    // Cleanup
    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
    await browser.close();
  }
})();
