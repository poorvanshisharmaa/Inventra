import { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, TrendingUp } from 'lucide-react';
import { PhotoInventoryCount } from '@/components/ai/PhotoInventoryCount';
import { DemandSignalDetector } from '@/components/ai/DemandSignalDetector';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'photo', label: 'Photo Stock Count', icon: Camera, description: 'Upload a shelf photo — AI counts visible units and flags discrepancies' },
  { id: 'demand', label: 'Demand Signals', icon: TrendingUp, description: 'Live signals: weather, events, seasons that affect your products' },
] as const;

type Tab = typeof TABS[number]['id'];


export default function DistributorTools() {
  const [activeTab, setActiveTab] = useState<Tab>('photo');

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Tools</h1>
        <p className="text-muted-foreground text-sm mt-1">AI-powered tools available to distributors</p>
      </div>

      {/* Tab selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TABS.map(tab => (
          <motion.button
            key={tab.id}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'p-4 rounded-xl border-2 text-left transition-all duration-200',
              activeTab === tab.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/30 hover:bg-muted/30'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
                activeTab === tab.id ? 'gradient-purple' : 'bg-muted'
              )}>
                <tab.icon className={cn('h-4 w-4', activeTab === tab.id ? 'text-primary-foreground' : 'text-muted-foreground')} />
              </div>
              <div>
                <p className="text-sm font-medium">{tab.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tab.description}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'photo'  && <PhotoInventoryCount />}
        {activeTab === 'demand' && <DemandSignalDetector />}
      </motion.div>
    </div>
  );
}
