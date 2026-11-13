import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

// Drop-in replacement for <input type="password" ...> with a show/hide button.
// Pass the same props (value, onChange, placeholder, required, className, ...).
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({ className = '', ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative w-full">
      <input ref={ref} {...props} type={visible ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';