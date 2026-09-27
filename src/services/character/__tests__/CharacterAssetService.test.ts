import { describe, it, expect } from 'vitest';
import { CharacterAssetService, CHARACTER_STAGES } from '../CharacterAssetService';

describe('CharacterAssetService', () => {
  it('resolves base initiate stage for level 1 rank E', () => {
    const bundle = CharacterAssetService.getActiveCharacter(1, 'E');
    expect(bundle.stageId).toBe('stage-base');
    expect(bundle.front).toBeDefined();
    expect(bundle.back).toBeDefined();
  });

  it('resolves stage 1 for intermediate ranks C and B', () => {
    const bundleC = CharacterAssetService.getActiveCharacter(10, 'C');
    expect(bundleC.stageId).toBe('stage-01');

    const bundleB = CharacterAssetService.getActiveCharacter(20, 'B');
    expect(bundleB.stageId).toBe('stage-01');
  });

  it('resolves stage 2 for high level 40+ or apex ranks A, S, SS, SSS', () => {
    const bundleA = CharacterAssetService.getActiveCharacter(10, 'A');
    expect(bundleA.stageId).toBe('stage-02');

    const bundleS = CharacterAssetService.getActiveCharacter(30, 'S');
    expect(bundleS.stageId).toBe('stage-02');

    const bundleHighLevel = CharacterAssetService.getActiveCharacter(45, 'E');
    expect(bundleHighLevel.stageId).toBe('stage-02');
  });

  it('returns all defined stages for selection', () => {
    const stages = CharacterAssetService.getAllStages();
    expect(stages.length).toBe(3);
    stages.forEach((stage) => {
      expect(stage.frontAsset).toBeDefined();
      expect(stage.backAsset).toBeDefined();
      expect(stage.name).toBeDefined();
    });
  });
});
