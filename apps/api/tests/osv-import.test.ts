import { describe, expect, it } from 'vitest';
import { osvJsonZuEingaengen } from '../src/portal/osv-import';

describe('OSV-Import: osv.dev-Schema → Spiegel-Zeilen', () => {
  it('extrahiert Range-Events (introduced/fixed) je betroffenem Paket', () => {
    const osv = {
      id: 'GHSA-jfh8-c2jp-5v3q',
      summary: 'Log4Shell',
      severity: [{ type: 'CVSS_V3', score: '10.0' }],
      affected: [
        {
          package: { ecosystem: 'Maven', name: 'org.apache.logging.log4j:log4j-core' },
          ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '2.0' }, { fixed: '2.15.0' }] }],
        },
      ],
    };
    const e = osvJsonZuEingaengen(osv);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      osvId: 'GHSA-jfh8-c2jp-5v3q',
      ecosystem: 'Maven',
      paket: 'org.apache.logging.log4j:log4j-core',
      eingefuehrt: '2.0',
      behoben: '2.15.0',
      schweregrad: '10.0',
    });
  });

  it('markiert zurückgezogene Advisories', () => {
    const e = osvJsonZuEingaengen({
      id: 'X',
      withdrawn: '2026-01-01T00:00:00Z',
      affected: [
        {
          package: { ecosystem: 'npm', name: 'lodash' },
          ranges: [{ events: [{ introduced: '0' }, { fixed: '1.0.0' }] }],
        },
      ],
    });
    expect(e[0]?.zurueckgezogen).toBe(true);
  });

  it('Bereich ohne fixed bleibt offen (behoben null)', () => {
    const e = osvJsonZuEingaengen({
      id: 'Y',
      affected: [
        {
          package: { ecosystem: 'npm', name: 'foo' },
          ranges: [{ events: [{ introduced: '1.0.0' }] }],
        },
      ],
    });
    expect(e[0]?.behoben).toBeNull();
  });

  it('kappt Ökosystem-Suffixe (Debian:12 → Debian)', () => {
    const e = osvJsonZuEingaengen({
      id: 'Z',
      affected: [
        {
          package: { ecosystem: 'Debian:12', name: 'bash' },
          ranges: [{ events: [{ introduced: '0' }, { fixed: '5.0' }] }],
        },
      ],
    });
    expect(e[0]?.ecosystem).toBe('Debian');
  });

  it('ignoriert Datensätze ohne id', () => {
    expect(osvJsonZuEingaengen({ affected: [] })).toEqual([]);
  });
});
