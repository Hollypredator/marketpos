import React from 'react';

interface NumpadProps {
  disabled?: boolean;
  onBackspace: () => void;
  onClear: () => void;
  onDigit: (value: string) => void;
  onEnter?: () => void;
}

const DIGITS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'];

export default function Numpad({
  disabled,
  onBackspace,
  onClear,
  onDigit,
  onEnter,
}: NumpadProps) {
  return (
    <div className="numpad">
      <button className="numpad-btn numpad-clear" disabled={disabled} onClick={onClear} type="button">
        C
      </button>
      {DIGITS.map((digit) => (
        <button
          key={digit}
          className="numpad-btn"
          disabled={disabled}
          onClick={() => onDigit(digit)}
          type="button"
        >
          {digit}
        </button>
      ))}
      <button className="numpad-btn" disabled={disabled} onClick={onBackspace} type="button">
        Del
      </button>
      {onEnter && (
        <button
          className="numpad-btn numpad-enter"
          disabled={disabled}
          onClick={onEnter}
          type="button"
        >
          OK
        </button>
      )}
    </div>
  );
}
