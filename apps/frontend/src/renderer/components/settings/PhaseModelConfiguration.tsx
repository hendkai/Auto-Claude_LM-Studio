/**
 * Phase Model Configuration
 * =========================
 * 
 * Konfiguriert die Model-Prioritäts-Listen für jede Phase.
 * Drag & Drop zum Umsortieren, Modelle hinzufügen/entfernen.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  GripVertical, 
  Plus, 
  X, 
  Search,
  Lightbulb,
  FileText,
  Code,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';
import { useLLMProviderStore, useEnabledProviders } from '../../stores/llm-provider-store';
import type { 
  PipelinePhase,
  ModelReference,
  LLMProviderSettings,
} from '../../../shared/types/llm-provider';

const PHASE_CONFIG: Record<PipelinePhase, { 
  label: string; 
  icon: React.ElementType;
  description: string;
  recommended: string[];
}> = {
  spec: {
    label: 'Spec Creation',
    icon: FileText,
    description: 'Discovery, requirements gathering, and context analysis',
    recommended: ['claude-sonnet', 'gpt-4o', 'claude-haiku'],
  },
  planning: {
    label: 'Implementation Planning',
    icon: Lightbulb,
    description: 'Creating detailed implementation plans and architecture',
    recommended: ['claude-opus', 'gpt-4o', 'claude-sonnet'],
  },
  coding: {
    label: 'Coding & Implementation',
    icon: Code,
    description: 'Actual code implementation and development',
    recommended: ['claude-sonnet', 'gpt-4o', 'claude-opus'],
  },
  qa: {
    label: 'QA & Review',
    icon: CheckCircle,
    description: 'Code review, testing, and quality assurance',
    recommended: ['claude-haiku', 'gpt-4o-mini', 'claude-sonnet'],
  },
};

export function PhaseModelConfiguration() {
  const { t } = useTranslation('settings');
  const [activePhase, setActivePhase] = useState<PipelinePhase | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ phase: PipelinePhase; index: number } | null>(null);
  
  const phaseModelPriorities = useLLMProviderStore((state) => state.phaseModelPriorities);
  const { addModelToPhasePriority, removeModelFromPhasePriority, movePhasePriority } = useLLMProviderStore();
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          Phase Model Configuration
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure which models to use for each phase. The system will automatically 
          fall back to the next model if the primary is unavailable.
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(PHASE_CONFIG) as PipelinePhase[]).map((phase) => {
          const config = PHASE_CONFIG[phase];
          const priorities = phaseModelPriorities[phase];
          const Icon = config.icon;
          
          return (
            <Card key={phase} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{config.label}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {priorities.length} model{priorities.length !== 1 ? 's' : ''} configured
                    </p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {config.description}
                </p>
                
                {/* Priority List */}
                <div className="space-y-2">
                  {priorities.length === 0 && (
                    <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      No models configured
                    </div>
                  )}
                  
                  {priorities.map((ref, index) => (
                    <PriorityItem
                      key={`${ref.providerId}-${ref.modelId}-${index}`}
                      ref={ref}
                      index={index}
                      total={priorities.length}
                      phase={phase}
                      isDragged={draggedItem?.phase === phase && draggedItem?.index === index}
                      onDragStart={() => setDraggedItem({ phase, index })}
                      onDragEnd={() => setDraggedItem(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedItem && draggedItem.phase === phase && draggedItem.index !== index) {
                          movePhasePriority(phase, draggedItem.index, index);
                          setDraggedItem({ phase, index });
                        }
                      }}
                      onRemove={() => removeModelFromPhasePriority(phase, index)}
                    />
                  ))}
                </div>
                
                {/* Add Model Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setActivePhase(phase)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Model
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Add Model Dialog */}
      <AddModelDialog
        phase={activePhase}
        isOpen={activePhase !== null}
        onClose={() => setActivePhase(null)}
        onAdd={(reference) => {
          if (activePhase) {
            addModelToPhasePriority(activePhase, reference);
          }
        }}
      />
    </div>
  );
}

// ============================================
// Priority Item Component
// ============================================

interface PriorityItemProps {
  ref: ModelReference;
  index: number;
  total: number;
  phase: PipelinePhase;
  isDragged: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onRemove: () => void;
}

function PriorityItem({
  ref,
  index,
  total,
  phase,
  isDragged,
  onDragStart,
  onDragEnd,
  onDragOver,
  onRemove,
}: PriorityItemProps) {
  const providers = useEnabledProviders();
  const provider = providers.find(p => p.id === ref.providerId);
  
  const isPrimary = index === 0;
  
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      className={cn(
        'flex items-center gap-2 rounded-md border bg-card p-2 transition-all',
        isDragged && 'opacity-50',
        isPrimary && 'border-primary/50 bg-primary/5'
      )}
    >
      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
      
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {index + 1}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {ref.displayName || ref.modelId}
          </span>
          {isPrimary && (
            <Badge variant="default" className="text-[10px]">Primary</Badge>
          )}
          {!provider && (
            <Badge variant="destructive" className="text-[10px]">Disabled</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {provider?.name || ref.providerId}
        </p>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ============================================
// Add Model Dialog
// ============================================

interface AddModelDialogProps {
  phase: PipelinePhase | null;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (reference: ModelReference) => void;
}

function AddModelDialog({ phase, isOpen, onClose, onAdd }: AddModelDialogProps) {
  const { t } = useTranslation('settings');
  const providers = useEnabledProviders();
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [customModelId, setCustomModelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  
  // Reset when dialog opens
  useState(() => {
    setSelectedProviderId('');
    setSelectedModelId('');
    setCustomModelId('');
    setDisplayName('');
    setSearchQuery('');
  });
  
  const handleAdd = () => {
    if (!selectedProviderId) return;
    
    const modelId = selectedModelId || customModelId;
    if (!modelId) return;
    
    onAdd({
      providerId: selectedProviderId,
      modelId,
      displayName: displayName || undefined,
    });
    
    onClose();
  };
  
  // Mock available models - in real implementation, fetch from backend
  const availableModels = selectedProvider ? [
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ].filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())) : [];
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add Model to {phase ? PHASE_CONFIG[phase].label : 'Phase'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={selectedProviderId}
              onValueChange={setSelectedProviderId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a provider..." />
              </SelectTrigger>
              <SelectContent>
                {providers.length === 0 && (
                  <SelectItem value="" disabled>
                    No enabled providers available
                  </SelectItem>
                )}
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Model Selection */}
          {selectedProvider && (
            <div className="space-y-2">
              <Label>Model</Label>
              
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              
              <Select
                value={selectedModelId}
                onValueChange={setSelectedModelId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="text-center text-xs text-muted-foreground">
                or
              </div>
              
              <Input
                placeholder="Enter custom model ID..."
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
              />
            </div>
          )}
          
          {/* Display Name (Optional) */}
          <div className="space-y-2">
            <Label>
              Display Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              placeholder="e.g., GPT-4o (Primary)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          
          {/* Preview */}
          {(selectedModelId || customModelId) && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">Preview:</p>
              <p className="text-sm">
                {displayName || selectedModelId || customModelId}
              </p>
              <p className="text-xs text-muted-foreground">
                via {selectedProvider?.name}
              </p>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdd}
            disabled={!selectedProviderId || (!selectedModelId && !customModelId)}
          >
            Add Model
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
