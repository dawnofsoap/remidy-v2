import { useQueryClient } from '@tanstack/react-query';
import { RequestFailure, updateSpace } from './session.ts';
import { canManage, SPACES_QUERY_KEY, useSettingsSpace } from './space.tsx';
import { SelectField, toast } from '../ui/index.ts';

/**
 * The time zone of the space the area is about. It decides when that space's bills count as due
 * today, so a household's applies to everyone in it.
 */
export function TimeZoneSection() {
  const queryClient = useQueryClient();
  const space = useSettingsSpace();

  const zones = Intl.supportedValuesOf('timeZone');
  const options = zones.includes(space.timeZone) ? zones : [space.timeZone, ...zones];
  const hint =
    space.kind === 'shared'
      ? 'Decides when a shared bill counts as due today, for everyone in the household.'
      : 'Decides when your personal bills count as due today.';

  async function save(timeZone: string) {
    try {
      await updateSpace(space.id, { timeZone });
      toast('Time zone saved.');
      await queryClient.invalidateQueries({ queryKey: SPACES_QUERY_KEY });
    } catch (failure) {
      toast(failure instanceof RequestFailure ? failure.message : 'That didn’t work. Try again.');
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <SelectField
        label="Time zone"
        hint={hint}
        value={space.timeZone}
        disabled={!canManage(space)}
        onChange={(event) => void save(event.target.value)}
      >
        {options.map((zone) => (
          <option key={zone}>{zone}</option>
        ))}
      </SelectField>
    </div>
  );
}
