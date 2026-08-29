import { cn } from "@/lib/utils";

interface DashboardBrandProps {
  className?: string;
}

export function DashboardBrand({ className }: DashboardBrandProps) {
  return (
    <img
      alt="My King · AI WROK OS"
      className={cn("block h-8 w-auto object-contain", className)}
      height="48"
      src="/assets/my-king-lockup.png"
      width="128"
    />
  );
}
