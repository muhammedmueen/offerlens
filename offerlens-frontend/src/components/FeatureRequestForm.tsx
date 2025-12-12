import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createFeatureRequest, FeatureRequestCreate } from "@/lib/api";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

/**
 * FeatureRequestForm Component
 * Requirements: 3.1, 3.2, 3.3
 * 
 * Allows users to submit feature requests
 * - Request a new role
 * - Suggest a feature
 * - Report an issue
 */

interface FeatureRequestFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function FeatureRequestForm({ onSuccess, onCancel }: FeatureRequestFormProps) {
  const [type, setType] = useState<'role' | 'feature' | 'issue'>('feature');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset states
    setSubmitError(null);
    setSubmitSuccess(false);

    // Validation
    if (title.trim().length < 5) {
      setSubmitError('Title must be at least 5 characters');
      return;
    }

    if (description.trim().length < 10) {
      setSubmitError('Description must be at least 10 characters');
      return;
    }

    if (userEmail && !isValidEmail(userEmail)) {
      setSubmitError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const data: FeatureRequestCreate = {
        type,
        title: title.trim(),
        description: description.trim(),
      };

      if (userEmail.trim()) {
        data.userEmail = userEmail.trim();
      }

      await createFeatureRequest(data);
      
      setSubmitSuccess(true);
      
      // Reset form
      setTitle('');
      setDescription('');
      setUserEmail('');
      setType('feature');

      // Call success callback after a delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
      }, 2000);
    } catch (error: any) {
      console.error('Feature request submission error:', error);
      setSubmitError(error.message || 'Failed to submit feature request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  if (submitSuccess) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Request Submitted!
        </h3>
        <p className="text-muted-foreground">
          Thank you for your feedback. We'll review your request soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Request Type */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          Request Type
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setType('role')}
            className={`p-3 rounded-xl border-2 transition-all text-sm font-medium ${
              type === 'role'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'
            }`}
          >
            Request Role
          </button>
          <button
            type="button"
            onClick={() => setType('feature')}
            className={`p-3 rounded-xl border-2 transition-all text-sm font-medium ${
              type === 'feature'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'
            }`}
          >
            Suggest Feature
          </button>
          <button
            type="button"
            onClick={() => setType('issue')}
            className={`p-3 rounded-xl border-2 transition-all text-sm font-medium ${
              type === 'issue'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'
            }`}
          >
            Report Issue
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-foreground mb-2">
          Title <span className="text-destructive">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            type === 'role'
              ? 'e.g., Add Data Scientist role'
              : type === 'feature'
              ? 'e.g., Add equity calculator'
              : 'e.g., Analysis not working for long offers'
          }
          maxLength={200}
          className="w-full h-12 px-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground"
          required
        />
        <p className="text-xs text-muted-foreground mt-1">
          {title.length}/200 characters
        </p>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
          Description <span className="text-destructive">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            type === 'role'
              ? 'Tell us about the role you want to see added...'
              : type === 'feature'
              ? 'Describe the feature you would like to see...'
              : 'Describe the issue you encountered...'
          }
          maxLength={5000}
          rows={6}
          className="w-full p-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none transition-all text-foreground placeholder:text-muted-foreground"
          required
        />
        <p className="text-xs text-muted-foreground mt-1">
          {description.length}/5000 characters
        </p>
      </div>

      {/* Email (Optional) */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
          Email (Optional)
        </label>
        <input
          id="email"
          type="email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          placeholder="your.email@example.com"
          className="w-full h-12 px-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground mt-1">
          We'll notify you when we review your request
        </p>
      </div>

      {/* Error Message */}
      {submitError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{submitError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="hero"
          disabled={isSubmitting}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Request'
          )}
        </Button>
      </div>
    </form>
  );
}
