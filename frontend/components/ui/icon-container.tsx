import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface IconContainerProps {
  icon: LucideIcon
  size?: "sm" | "md" | "lg" | "xl"
  variant?: "default" | "primary" | "success" | "warning" | "destructive"
  className?: string
}

const sizes = {
  sm: "h-8 w-8 [&>svg]:h-4 [&>svg]:w-4",
  md: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5",
  lg: "h-12 w-12 [&>svg]:h-6 [&>svg]:w-6",
  xl: "h-14 w-14 [&>svg]:h-7 [&>svg]:w-7",
}

const variants = {
  default: "bg-secondary text-secondary-foreground",
  primary: "gradient-primary-subtle text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
}

export function IconContainer({ icon: Icon, size = "md", variant = "default", className }: IconContainerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl transition-smooth",
        sizes[size],
        variants[variant],
        className,
      )}
    >
      <Icon />
    </div>
  )
}
