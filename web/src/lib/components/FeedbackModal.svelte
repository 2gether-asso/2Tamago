<script lang="ts">
  import { FEEDBACK_TYPES, type FeedbackType } from '@2tamago/core/contracts';
  import { page } from '$app/state';
  import { api, ApiError } from '#lib/api.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  interface Props {
    open: boolean;
  }
  let { open = $bindable(false) }: Props = $props();

  const ICONS: Record<FeedbackType, string> = { bug: '🐞', idea: '💡', other: '💬' };
  const MIN = 10;
  const MAX = 2000;

  let dialog = $state<HTMLDialogElement>();
  let type = $state<FeedbackType>('idea');
  let message = $state('');
  let sending = $state(false);
  let valid = $derived(message.trim().length >= MIN);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!valid || sending) return;
    sending = true;
    try {
      await api.sendFeedback({ type, message: message.trim(), page: page.url.pathname });
      toasts.push(t('feedback.thanks'));
      message = '';
      open = false;
    } catch (e) {
      toasts.push(e instanceof ApiError ? e.message : t('feedback.failed'), 'error');
    } finally {
      sending = false;
    }
  }
</script>

<dialog bind:this={dialog} class="card" onclose={() => (open = false)} aria-labelledby="fb-title">
  <form onsubmit={submit}>
    <h2 id="fb-title">{t('feedback.title')}</h2>
    <p class="muted">{t('feedback.intro')}</p>

    <fieldset>
      <legend class="sr-only">{t('feedback.type_label')}</legend>
      {#each FEEDBACK_TYPES as option (option)}
        <label class:selected={type === option}>
          <input type="radio" name="feedback-type" value={option} bind:group={type} />
          <span aria-hidden="true">{ICONS[option]}</span>
          {t(`feedback.type.${option}`)}
        </label>
      {/each}
    </fieldset>
    <p class="muted hint">{t(`feedback.type.${type}_hint`)}</p>

    <label class="field">
      <span class="sr-only">{t('feedback.message_label')}</span>
      <textarea
        bind:value={message}
        maxlength={MAX}
        rows="6"
        required
        placeholder={t('feedback.placeholder')}
      ></textarea>
    </label>
    <p class="muted count">
      {message.trim().length < MIN
        ? t('feedback.min_remaining', { count: MIN - message.trim().length })
        : `${message.length} / ${MAX}`}
    </p>

    <div class="actions">
      <button type="button" class="link" onclick={() => (open = false)}
        >{t('feedback.cancel')}</button
      >
      <button class="primary" disabled={!valid || sending}>
        {sending ? t('feedback.sending') : t('feedback.send')}
      </button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(30rem, calc(100vw - 2rem));
    color: var(--text);
    padding: 1.2rem;
  }
  dialog::backdrop {
    background: rgb(6 7 15 / 0.55);
    backdrop-filter: blur(4px);
  }
  form {
    display: grid;
    gap: 0.6rem;
  }
  h2 {
    margin: 0;
  }
  p {
    margin: 0;
  }
  fieldset {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    border: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }
  fieldset label {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    padding: 0.35rem 0.9rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    font-weight: 600;
  }
  fieldset label.selected {
    border-color: var(--accent);
    background: rgb(var(--accent-rgb) / 0.14);
    color: var(--accent);
  }
  fieldset input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  fieldset label:has(input:focus-visible) {
    outline: 2px solid var(--accent-2);
    outline-offset: 2px;
  }
  .hint,
  .count {
    font-size: 0.85rem;
  }
  .count {
    text-align: right;
  }
  textarea {
    width: 100%;
    font: inherit;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    resize: vertical;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.6rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
