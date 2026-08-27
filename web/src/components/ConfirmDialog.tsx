import type { ComponentProps } from "react";
import { ConfirmDialog as BaseConfirmDialog } from "@nous-research/ui/ui/components/confirm-dialog";

import { useI18n } from "@/i18n";

type ConfirmDialogProps = ComponentProps<typeof BaseConfirmDialog>;

export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  ...props
}: ConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <BaseConfirmDialog
      {...props}
      cancelLabel={cancelLabel ?? t.common.cancel}
      confirmLabel={confirmLabel ?? t.common.confirm}
    />
  );
}
