import type { WindowCloudBank, WindowField as ContractField } from '../../contracts/index.ts';
import { windowFields, type WindowField } from '../adapter.ts';

/** R38's typed optical slots and the earlier plugin envelope meet only at the window seam. */
export function opticalFields(view: object | undefined): readonly WindowField[] {
  return windowFields(view).map((field) => {
    if (field.kind !== 'funnel') return field;
    return { id: field.id, kind: 'inverse-well', visual: field as unknown as ContractField };
  });
}

export function cloudBanks(
  view: { readonly fields?: readonly ContractField[] } | undefined,
): readonly WindowCloudBank[] {
  return (
    view?.fields?.filter((field): field is WindowCloudBank => field.kind === 'cloud-bank') ?? []
  );
}
