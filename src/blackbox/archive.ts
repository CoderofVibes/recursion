/**
 * BlackBoxArchive helpers (DECISIONS P8): everything preserved across recurrence.
 * Pure functions returning new archives; records are never edited in place.
 */

import {
  issueForecast,
  type AttemptRecord,
  type BlackBoxArchive,
  type EncounterId,
  type ExtensionId,
  type Forecast,
  type Lead,
  type Procedure,
  type ProcedureId,
} from '../contracts/index.ts';

export function emptyArchive(): BlackBoxArchive {
  return { attempts: [], procedures: [], adoptedExtensions: [], leads: [] };
}

/** Add or replace an attempt (by id), keeping attempts ordered by index. */
export function withAttempt(a: BlackBoxArchive, rec: AttemptRecord): BlackBoxArchive {
  const attempts = [...a.attempts.filter((r) => r.id !== rec.id), rec].sort(
    (x, y) => x.index - y.index,
  );
  return { ...a, attempts };
}

export function nextAttemptIndex(a: BlackBoxArchive): number {
  return a.attempts.reduce((m, r) => Math.max(m, r.index), 0) + 1;
}

export function attemptsFor(a: BlackBoxArchive, encounterId: EncounterId): AttemptRecord[] {
  return a.attempts.filter((r) => r.encounterId === encounterId);
}

export function withProcedure(a: BlackBoxArchive, p: Procedure): BlackBoxArchive {
  return { ...a, procedures: [...a.procedures.filter((q) => q.id !== p.id), p] };
}

export function withoutProcedure(a: BlackBoxArchive, id: ProcedureId): BlackBoxArchive {
  return { ...a, procedures: a.procedures.filter((q) => q.id !== id) };
}

export function withAdoptedExtensions(
  a: BlackBoxArchive,
  ids: readonly ExtensionId[],
): BlackBoxArchive {
  return { ...a, adoptedExtensions: [...ids] };
}

export function withLead(a: BlackBoxArchive, lead: Lead): BlackBoxArchive {
  return { ...a, leads: [...a.leads.filter((l) => l.id !== lead.id), lead] };
}

/**
 * Records loaded from storage: forecasts pass through issueForecast again so they are frozen
 * and branded (contracts README § forecast.ts).
 */
export function reissue(rec: AttemptRecord): AttemptRecord {
  return {
    ...rec,
    forecasts: rec.forecasts.map(
      (f) => issueForecast(f as unknown as Parameters<typeof issueForecast>[0]) as Forecast,
    ),
  };
}
