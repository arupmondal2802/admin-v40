
import React from 'react';
import Button from './Button';
import { IconPlus, IconMinus } from './Icon';

interface QuantityInputProps {
    value: number;
    onChange: (newValue: number) => void;
    min?: number;
}

const QuantityInput: React.FC<QuantityInputProps> = ({ value, onChange, min = 0 }) => {
    const handleDecrement = () => onChange(Math.max(min, value - 1));
    const handleIncrement = () => onChange(value + 1);

    return (
        <div className="flex items-center space-x-2">
            <Button variant="secondary" size="sm" onClick={handleDecrement} className="p-2 rounded-full w-10 h-10" aria-label="Decrease quantity">
                <IconMinus className="w-5 h-5"/>
            </Button>
            <span className="text-lg font-semibold w-12 text-center" aria-live="polite">{value}</span>
            <Button variant="secondary" size="sm" onClick={handleIncrement} className="p-2 rounded-full w-10 h-10" aria-label="Increase quantity">
                <IconPlus className="w-5 h-5"/>
            </Button>
        </div>
    );
};

export default QuantityInput;
