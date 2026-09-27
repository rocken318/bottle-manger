import { startTransition, type FormEvent } from 'react';

/**
 * onSubmit handler that runs a useActionState action without React's automatic form reset.
 *
 * With `<form action={fn}>`, React 19 resets the form after every submit, even a failed one: selects
 * jump back to their first option (a staff member suddenly shows 「スタッフ」, the login name goes
 * blank) and typed values are lost, which looks like the save went wrong. Forms that should be
 * cleared after success (e.g. create forms) do it themselves from the action's result.
 */
export function submitWithoutReset(formAction: (payload: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(data));
  };
}
