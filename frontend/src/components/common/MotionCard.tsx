import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface MotionCardProps extends HTMLMotionProps<"div"> {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}

const MotionCard = ({ delay = 0, className, children, ...props }: MotionCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-40px" }}
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    whileTap={{ scale: 0.985 }}
    transition={{ delay, duration: 0.4, ease: "easeOut" }}
    className={cn("transition-shadow", className)}
    {...props}
  >
    {children}
  </motion.div>
);

export default MotionCard;
