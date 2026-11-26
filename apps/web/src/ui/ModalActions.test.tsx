// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, ModalActions } from './index.ts';

afterEach(cleanup);

describe('ModalActions', () => {
  it('puts side actions first, then Cancel, then the main action last', () => {
    render(
      <ModalActions start={<Button variant="danger">Delete…</Button>}>
        <Button variant="secondary">Cancel</Button>
        <Button>Save</Button>
      </ModalActions>,
    );
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Delete…',
      'Cancel',
      'Save',
    ]);
  });
});
