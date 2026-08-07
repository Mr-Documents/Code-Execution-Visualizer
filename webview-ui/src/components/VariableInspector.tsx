import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useExecutionStore } from '../store/useExecutionStore';
import type { VariableValue } from '../store/useExecutionStore';

/** Stable, cheap display text for a variable's value. */
function displayValue(variable: VariableValue): string {
  if (variable.ref) return `[Ref: ${variable.ref}]`;
  return typeof variable.value === 'string' ? variable.value : JSON.stringify(variable.value);
}

interface VariableItemProps {
  name: string;
  display: string;
  type: string;
  hasChanged: boolean;
}

const VariableItem: React.FC<VariableItemProps> = ({ name, display, type, hasChanged }) => (
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
      key={display} // Re-mount on change so the value visibly pops.
      initial={{ scale: hasChanged ? 1.2 : 1, color: hasChanged ? 'var(--neon-pink)' : 'var(--text-primary)' }}
      animate={{ scale: 1, color: 'var(--text-primary)' }}
      className="var-value"
    >
      {display}
    </motion.span>
    <span className="var-type">({type})</span>
  </motion.div>
);

/** Lists the variables visible in the current frame, flagging what just changed. */
export const VariableInspector: React.FC = () => {
  const events = useExecutionStore((state) => state.events);
  const currentStep = useExecutionStore((state) => state.currentStep);

  const items = useMemo(() => {
    const scope = events[currentStep]?.scope;
    if (!scope) return [];
    const previousScope = currentStep > 0 ? events[currentStep - 1]?.scope : undefined;

    return Object.entries(scope).map(([name, variable]) => {
      const display = displayValue(variable);
      const previous = previousScope?.[name];
      return {
        name,
        display,
        type: variable.type,
        // Comparing rendered strings avoids a deep compare on every render.
        hasChanged: previous !== undefined && displayValue(previous) !== display
      };
    });
  }, [events, currentStep]);

  if (items.length === 0) {
    return <div className="placeholder">Empty Scope</div>;
  }

  return (
    <div className="variables-list" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
      <AnimatePresence>
        {items.map((item) => (
          <VariableItem
            key={item.name}
            name={item.name}
            display={item.display}
            type={item.type}
            hasChanged={item.hasChanged}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
