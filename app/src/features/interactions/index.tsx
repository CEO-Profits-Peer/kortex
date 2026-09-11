import React from 'react';

import { analytics } from '@/lib/analytics';
import { track } from '@/lib/eventBuffer';

import { BranchChoice, type BranchData } from './BranchChoice';
import { EstimateSlider, type EstimateData } from './EstimateSlider';
import { FillBlank, type FillBlankData } from './FillBlank';
import { MatchPairs, type MatchData } from './MatchPairs';
import { OrderTask, type OrderTaskData } from './OrderTask';
import { ParameterSlider, type ParameterData } from './ParameterSlider';
import { TrueFalseSwipe, type TrueFalseData } from './TrueFalseSwipe';

/**
 * Verteiler für die Interaktions-Templates.
 *
 * Der Kern der Skalierungsidee: Das Template ist handgeschriebener Code, die
 * KI füllt nur das json_schema aus (supabase/seed/0001). Damit wächst die
 * Interaktivität mit der Pipeline statt mit unserer Arbeitszeit.
 *
 * Gebaut: 9 von 10.
 * Offen:  hotspot_reveal - braucht als einziges echte Diagramm-Dateien und
 *         damit einen Grafik-Arbeitsablauf, den es noch nicht gibt. Eine
 *         Karte mit diesem Template fällt sauber auf ihren Text zurück.
 */

const BUILT: Record<string, true> = {
  estimate_slider: true,
  true_false_swipe: true,
  timeline_sort: true,
  rank_order: true,
  build_sequence: true,
  match_pairs: true,
  fill_blank: true,
  parameter_slider: true,
  branch_choice: true,
};

export function isInteractionBuilt(template: string | null | undefined): boolean {
  return Boolean(template && BUILT[template]);
}

export function Interaction({
  contentId,
  template,
  data,
  immediate,
}: {
  contentId: string;
  template: string | null;
  data: unknown;
  /** Aufgabe steht auf einer eigenen Seite - keine Verzoegerung noetig */
  immediate?: boolean;
}) {
  if (!template || !data || typeof data !== 'object') return null;

  /**
   * reveal_after_ms haelt Regler und Listen zurueck, bis der Kontext gelesen
   * sein kann. Liegt die Aufgabe auf einer EIGENEN Seite, hat der Nutzer den
   * Kontext schon bewusst weggeblaettert - dann waere die Wartezeit nur noch
   * aergerlich. Eigene Seite heisst also: sofort bedienbar.
   */
  const d = immediate ? { ...(data as Record<string, unknown>), reveal_after_ms: 0 } : data;

  const report = (solved: boolean) => {
    track(contentId, 'dwell', { payload: { interaction: template, solved } });
    analytics.interactionSolved(template, solved);
  };

  switch (template) {
    case 'estimate_slider':
      return <EstimateSlider data={d as EstimateData} onSolved={report} />;

    case 'true_false_swipe':
      return (
        <TrueFalseSwipe
          data={d as TrueFalseData}
          onSolved={(correct, total) => report(correct === total)}
        />
      );

    // Drei Varianten derselben Mechanik - unterschiedlich beschriftet,
    // gleiche Bedienung. Der Nutzer lernt sie einmal.
    case 'timeline_sort':
      return <OrderTask data={d as OrderTaskData} variant="timeline" onSolved={report} />;
    case 'rank_order':
      return <OrderTask data={d as OrderTaskData} variant="rank" onSolved={report} />;
    case 'build_sequence':
      return <OrderTask data={d as OrderTaskData} variant="sequence" onSolved={report} />;

    case 'match_pairs':
      return <MatchPairs data={d as MatchData} onSolved={report} />;

    case 'fill_blank':
      return <FillBlank data={d as FillBlankData} onSolved={report} />;

    case 'parameter_slider':
      return <ParameterSlider data={d as ParameterData} onSolved={report} />;

    case 'branch_choice':
      return <BranchChoice data={d as BranchData} onSolved={report} />;

    default:
      // hotspot_reveal und alles Unbekannte: Karte zeigt nur ihren Text.
      return null;
  }
}
