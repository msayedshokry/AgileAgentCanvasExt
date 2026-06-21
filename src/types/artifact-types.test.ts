import { describe, it, expectTypeOf } from 'vitest';
import type { Vision, UseCase, Story, PRD } from './index';

describe('core artifact types are not any', () => {
  it('Vision.targetUsers is a typed array', () => {
    expectTypeOf<Vision['targetUsers']>().not.toBeAny();
  });

  it('Vision.successMetrics is typed (never any)', () => {
    expectTypeOf<NonNullable<Vision['successMetrics']>>().not.toBeAny();
  });

  it('Story.uxReferences is typed (never any)', () => {
    expectTypeOf<NonNullable<Story['uxReferences']>>().not.toBeAny();
  });

  it('Story.references is typed (never any)', () => {
    expectTypeOf<NonNullable<Story['references']>>().not.toBeAny();
  });

  it('UseCase.actors is typed (never any)', () => {
    expectTypeOf<NonNullable<UseCase['actors']>>().not.toBeAny();
  });
});

describe('PRD requirement buckets are typed', () => {
  it('PRD.requirements.functional is not any', () => {
    expectTypeOf<NonNullable<NonNullable<PRD['requirements']>['functional']>>().not.toBeAny();
  });

  it('PRD.requirements.nonFunctional is not any', () => {
    expectTypeOf<NonNullable<NonNullable<PRD['requirements']>['nonFunctional']>>().not.toBeAny();
  });

  it('PRD.requirements.technical is not any', () => {
    expectTypeOf<NonNullable<NonNullable<PRD['requirements']>['technical']>>().not.toBeAny();
  });

  it('PRD.approvals is not any', () => {
    expectTypeOf<NonNullable<PRD['approvals']>>().not.toBeAny();
  });

  it('PRD.appendices is not any', () => {
    expectTypeOf<NonNullable<PRD['appendices']>>().not.toBeAny();
  });
});
