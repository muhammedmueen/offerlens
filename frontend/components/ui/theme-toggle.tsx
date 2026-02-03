"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { motion, useReducedMotion } from "framer-motion"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const shouldReduceMotion = useReducedMotion()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <Button variant="ghost" size="icon" className="h-9 w-9" aria-hidden />
  }

  const isDark = theme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 interactive"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <motion.div
        initial={false}
        animate={{
          rotate: shouldReduceMotion ? 0 : isDark ? 180 : 0,
          scale: 1,
        }}
        whileTap={shouldReduceMotion ? {} : { scale: 0.9 }}
        transition={{
          type: shouldReduceMotion ? "tween" : "spring",
          stiffness: 200,
          damping: 10,
          duration: shouldReduceMotion ? 0.1 : undefined,
        }}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </motion.div>
    </Button>
  )
}
