"use client";

import { SearchSelect } from "@/components/app/search-select";
import { searchPickerPeople } from "@/app/actions/lists";

/**
 * Choose a child's parent from the church's adult members. The adults are searched on the server as you type, so the
 * People and Children pages no longer carry a list of every adult.
 */
export function ParentSelect({ id, parentId, parentName, noneLabel = "No parent", compact }: {
  id?: string;
  parentId: string | null;
  parentName: string | null;
  noneLabel?: string;
  compact?: boolean;
}) {
  return (
    <SearchSelect
      name="parentId"
      compact={compact}
      defaultValue={parentId ?? ""}
      placeholder={noneLabel}
      searchPlaceholder="Type an adult's name…"
      options={[{ value: "", label: noneLabel }, ...(parentId && parentName ? [{ value: parentId, label: parentName }] : [])]}
      search={async (q) => [{ value: "", label: noneLabel }, ...(await searchPickerPeople("people", q, { adultsOnly: true }))]}
      key={id}
    />
  );
}
