import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface KPICardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  gradient: 'purple' | 'success' | 'warning' | 'info';
  delay?: number;
}

function useAnimatedCounter(target: number, duration = 1000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return count;
}

export function KPICard({ title, value, prefix = '', suffix = '', change, changeType = 'neutral', icon: Icon, gradient, delay = 0 }: KPICardProps) {
  const animatedValue = useAnimatedCounter(value);

  const gradientClass = {
    purple: 'gradient-purple',
    success: 'gradient-success',
    warning: 'gradient-warning',
    info: 'gradient-info',
  }[gradient];

  const changeColor = {
    positive: 'text-success',
    negative: 'text-destructive',
    neutral: 'text-muted-foreground',
  }[changeType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.1 }}
      className="group relative overflow-hidden rounded-xl bg-card border border-border/50 p-5 card-shadow transition-all duration-300 hover:card-shadow-hover hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold tracking-tight">
            {prefix}{animatedValue.toLocaleString()}{suffix}
          </p>
          {change && (
            <p className={`text-xs font-medium ${changeColor}`}>{change}</p>
          )}
        </div>
        <div className={`h-10 w-10 rounded-lg ${gradientClass} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${gradientClass} opacity-60`} />
    </motion.div>
  );
}
