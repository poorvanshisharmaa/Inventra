import { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Shield, Truck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hints = [
    { icon: Shield, label: 'Admin', email: 'admin@inventra.com', password: 'admin123' },
    { icon: Truck, label: 'Distributor', email: 'distributor@inventra.com', password: 'dist123' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    const result = await login(email, password);
    if (!result.success) setError(result.error ?? 'Invalid credentials');
    setLoading(false);
  };

  const fillCredentials = (hint: typeof hints[number]) => {
    setEmail(hint.email);
    setPassword(hint.password);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-info/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl gradient-purple flex items-center justify-center">
            <Package className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Inventra</h1>
            <p className="text-xs text-muted-foreground">Management Suite</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border/50 card-shadow p-6 space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          {/* Quick-fill role hints */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Quick login</label>
            <div className="grid grid-cols-2 gap-3">
              {hints.map((hint) => (
                <motion.button
                  key={hint.label}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => fillCredentials(hint)}
                  className={cn(
                    'relative p-4 rounded-xl border-2 text-left transition-all duration-200',
                    email === hint.email
                      ? 'border-primary bg-primary/5 glow-purple'
                      : 'border-border hover:border-primary/30 hover:bg-muted/30'
                  )}
                >
                  <div className="h-8 w-8 rounded-lg gradient-purple flex items-center justify-center mb-2">
                    <hint.icon className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <p className="text-sm font-medium">{hint.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{hint.email}</p>
                  {email === hint.email && (
                    <motion.div
                      layoutId="roleCheck"
                      className="absolute top-2 right-2 h-5 w-5 rounded-full gradient-purple flex items-center justify-center"
                    >
                      <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-destructive text-center"
              >
                {error}
              </motion.p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 gradient-purple text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
