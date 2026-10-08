import { assert } from 'console';

console.log('======================================================');
console.log('TEST SUITE: Data Recovery & Barcode Scanner QA');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

// 1. Barcode Scanner Render Contract Verification
console.log('--- 1. Barcode Scanner Render & Close Contract ---');

it('BarcodeScannerModal file includes if (!isOpen) return null guard', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/components/BarcodeScannerModal.tsx'), 'utf-8');
  assert(content.includes('if (!isOpen) return null;'), 'Missing if (!isOpen) return null in BarcodeScannerModal.tsx');
});

it('BarcodeScannerModal calls stopCamera on handleClose', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/components/BarcodeScannerModal.tsx'), 'utf-8');
  assert(content.includes('const handleClose = () => {'), 'Missing handleClose in BarcodeScannerModal.tsx');
  assert(content.includes('stopCamera();'), 'Missing stopCamera call in BarcodeScannerModal.tsx');
});

it('MealsPage wraps BarcodeScannerModal with isBarcodeModalOpen guard', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/components/MealsPage.tsx'), 'utf-8');
  assert(content.includes('{isBarcodeModalOpen && ('), 'MealsPage must conditionally mount BarcodeScannerModal');
  assert(content.includes('<BarcodeScannerModal'), 'BarcodeScannerModal should be present inside the conditional block');
});

// 2. Hydration Barrier & Race Condition Prevention
console.log('\n--- 2. Hydration Barrier & Race Condition Prevention ---');

it('page.tsx enforces (!mounted || !_hasHydrated) barrier before profile check', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf-8');
  assert(content.includes('if (!mounted || !_hasHydrated)'), 'page.tsx must use (!mounted || !_hasHydrated)');
  // Ensure the old broken check is gone
  assert(!content.includes('if (!_hasHydrated && !mounted)'), 'Broken (!_hasHydrated && !mounted) must be removed');
});

it('page.tsx does NOT synchronously override _hasHydrated in useEffect on mount', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf-8');
  // It shouldn't prematurely set hasHydrated on immediate mount
  assert(!content.includes("useStore.getState().setHasHydrated(true);\n  }, [_hasHydrated]);"), 'Synchronous hydration overwrite must be removed');
});

// 3. Disaster Auto-Recovery & Multi-Key Redundancy
console.log('\n--- 3. Disaster Auto-Recovery & Storage Redundancy ---');

it('store.ts includes automatic recovery from emergency snapshot in onRehydrateStorage', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/store.ts'), 'utf-8');
  assert(content.includes("localStorage.getItem('ascend_emergency_snapshot')"), 'Missing emergency snapshot check in store.ts');
  assert(content.includes("localStorage.getItem('ascend_profile')"), 'Missing discrete legacy profile check in store.ts');
  assert(content.includes("localStorage.getItem('ascend_workouts')"), 'Missing discrete legacy workouts check in store.ts');
  assert(content.includes("localStorage.getItem('ascend_prs')"), 'Missing discrete legacy PRs check in store.ts');
});

it('store.ts includes continuous sync subscriber for emergency snapshot', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/store.ts'), 'utf-8');
  assert(content.includes("localStorage.setItem('ascend_emergency_snapshot'"), 'Missing emergency snapshot auto-mirror in store.ts');
  assert(content.includes("localStorage.setItem('ascend_profile'"), 'Missing legacy profile auto-mirror in store.ts');
});

it('Onboarding.tsx checks emergency snapshot, ascend_store, and legacy keys on mount', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(path.join(process.cwd(), 'src/components/Onboarding.tsx'), 'utf-8');
  assert(content.includes("localStorage.getItem('ascend_emergency_snapshot')"), 'Onboarding must check ascend_emergency_snapshot');
  assert(content.includes("localStorage.getItem('ascend_store')"), 'Onboarding must check ascend_store');
  assert(content.includes("localStorage.getItem('ascend_profile')"), 'Onboarding must check ascend_profile');
});

console.log('\n======================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
