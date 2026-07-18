import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useExecutionStore } from '../store/useExecutionStore';
import type { VariableValue } from '../store/useExecutionStore';

const VariableItem: React.FC<{ name: string; variable: VariableValue; previousValue?: any }> = ({ name, variable, previousValue }) => {
  // Determine if value changed to trigger highlight
  const hasChanged = previousValue !== undefined && JSON.stringify(previousValue) !== JSON.stringify(variable.value);
  
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ 
        opacity: 1, 
        x: 0,
        backgroundColor: hasChanged ? 'rgba(0, 243, 255, 0.2)' : 'rgba(0,0,0,0.2)',
        borderColor: hasChanged ? 'var(--neon-pink)' : 'var(--neon-cyan)'
      }}
      transition={{ duration: 0.4 }}
      className="variable-item"
      style={{
        borderLeftWidth: '2px',
        borderLeftStyle: 'solid',
        boxShadow: hasChanged ? 'var(--glow-pink)' : 'none'
      }}
    >
      <span className="var-name">{name}:</span>
      <motion.span 
        key={JSON.stringify(variable.value)} // Force re-render of span on value change for a quick bump
        initial={{ scale: hasChanged ? 1.2 : 1, color: hasChanged ? 'var(--neon-pink)' : 'var(--text-primary)' }}
        animate={{ scale: 1, color: 'var(--text-primary)' }}
        className="var-value"
      >
        {variable.ref ? `[Ref: ${variable.ref}]` : JSON.stringify(variable.value)}
      </motion.span>
      <span className="var-type">({variable.type})</span>
    </motion.div>
  );
};

export const VariableInspector: React.FC = () => {
  const { events, currentStep } = useExecutionStore();
  const currentEvent = events[currentStep];
  const prevEvent = currentStep > 0 ? events[currentStep - 1] : undefined;

  if (!currentEvent || !currentEvent.scope) {
    return <div className="placeholder">Empty Scope</div>;
  }

  const variables = Object.entries(currentEvent.scope);

  return (
    <div className="variables-list" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
      <AnimatePresence>
        {variables.map(([key, variable]) => (
          <VariableItem 
            key={key} 
            name={key} 
            variable={variable} 
            previousValue={prevEvent?.scope[key]?.value} 
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
