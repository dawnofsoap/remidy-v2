import { useQueryClient } from '@tanstack/react-query';
import { RequestFailure, updateSpace } from '../../core/session.ts';
import { canManage, SPACES_QUERY_KEY, useSpaceFromAddress } from '../../core/space.tsx';
import { SelectField, toast } from '../../ui/index.ts';

/** The space's own details. Its name can change once there are shared spaces to name. */
export function GeneralSection() {
  const queryClient = useQueryClient();
  const { space } = useSpaceFromAddress();
  if (!space) return null;

  const zones = Intl.supportedValuesOf('timeZone');
  const options = zones.includes(space.timeZone) ? zones : [space.timeZone, ...zones];

  async function save(timeZone: string, spaceId: string) {
    try {
      await updateSpace(spaceId, { timeZone });
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
        hint="Decides when a bill counts as due today, for everyone in this space."
        value={space.timeZone}
        disabled={!canManage(space)}
        onChange={(event) => void save(event.target.value, space.id)}
      >
        {options.map((zone) => (
          <option key={zone}>{zone}</option>
        ))}
      </SelectField>
    </div>
  );
}
