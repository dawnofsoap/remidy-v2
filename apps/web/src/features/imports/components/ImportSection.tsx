import type { ImportPreviewResponse, ImportResponse } from '@remidy/contracts';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { canManage, useHousehold } from '../../../core/space.tsx';
import { Button, EmptyState, FileButton, LoadingState } from '../../../ui/index.ts';
import { importBills, previewImport, readExportFile } from '../api.ts';
import { ImportReview } from './ImportReview.tsx';

type Stage =
  | { name: 'choose'; problem: string | null }
  | { name: 'reading' }
  | { name: 'review'; file: unknown; preview: ImportPreviewResponse }
  | { name: 'done'; result: ImportResponse };

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** Choosing v1's export, reviewing what it holds, and importing the bills chosen. */
export function ImportSection() {
  const queryClient = useQueryClient();
  const household = useHousehold();
  const [stage, setStage] = useState<Stage>({ name: 'choose', problem: null });

  const choose = async (chosen: File) => {
    setStage({ name: 'reading' });
    try {
      const file = await readExportFile(chosen);
      setStage({ name: 'review', file, preview: await previewImport(file) });
    } catch (error) {
      const problem = error instanceof Error ? error.message : 'That file couldn’t be read.';
      setStage({ name: 'choose', problem });
    }
  };
  const startAgain = () => {
    setStage({ name: 'choose', problem: null });
  };

  if (stage.name === 'reading') return <LoadingState label="Reading the export" />;

  if (stage.name === 'review') {
    return (
      <ImportReview
        preview={stage.preview}
        canAddToHousehold={household ? canManage(household) : false}
        onImport={async (choices) => {
          const result = await importBills(stage.file, choices);
          // Bills, the agenda, totals and categories all change.
          await queryClient.invalidateQueries();
          setStage({ name: 'done', result });
        }}
        onCancel={startAgain}
      />
    );
  }

  if (stage.name === 'done') {
    const { billCount, categoryCount } = stage.result;
    return (
      <EmptyState
        title={`Imported ${plural(billCount, 'bill', 'bills')}`}
        description={[
          'Their due dates start today.',
          categoryCount > 0
            ? `${plural(categoryCount, 'new category was', 'new categories were')} added too.`
            : '',
        ]
          .join(' ')
          .trim()}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/bills" className="font-semibold text-accent underline">
              Go to Bills
            </Link>
            <Button variant="secondary" onClick={startAgain}>
              Import another file
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex max-w-prose flex-col gap-4">
      <p>
        Bring your bills over from v1. In v1, open Settings and export your data, then choose that
        file here. You’ll see everything it holds before anything is saved.
      </p>
      <p className="text-sm text-ink-2">
        Bills and categories come across. Accounts and payment history don’t yet. The file is read
        and then forgotten: it’s never stored.
      </p>
      {stage.problem ? (
        <p role="alert" className="font-semibold text-danger">
          {stage.problem}
        </p>
      ) : null}
      <div>
        <FileButton
          variant="primary"
          accept="application/json,.json"
          onFile={(file) => void choose(file)}
        >
          Choose v1 export
        </FileButton>
      </div>
    </div>
  );
}
