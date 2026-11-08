<script lang="ts">
  import { api } from '#lib/api.ts';
  import { i18n, t } from '#lib/i18n/index.svelte.ts';
  import { push } from '#lib/push.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  $effect(() => {
    void push.refresh();
  });
  // The service worker writes in the language the server knows for this browser.
  $effect(() => {
    void i18n.locale;
    void push.syncLocale();
  });

  async function toggle() {
    try {
      if (push.status === 'on') {
        await push.disable();
        toasts.push(t('push.disabled_toast'));
      } else {
        if (await push.enable()) toasts.push(t('push.enabled_toast'));
      }
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    }
  }

  async function test() {
    try {
      const { sent } = await api.pushTest();
      toasts.push(t(sent > 0 ? 'push.test_sent' : 'push.test_none'));
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    }
  }
</script>

<section class="card" aria-labelledby="push-title">
  <h2 id="push-title">{t('push.title')}</h2>
  {#if push.status === 'loading'}
    <p class="muted">{t('common.loading')}</p>
  {:else if push.status === 'unsupported' || push.status === 'unavailable' || push.status === 'denied'}
    <p class="muted">{t(`push.${push.status}`)}</p>
  {:else}
    <p class="muted">{t('push.intro')}</p>
    <div class="actions">
      <button type="button" disabled={push.busy} onclick={toggle}>
        {push.status === 'on' ? t('push.disable') : t('push.enable')}
      </button>
      {#if push.status === 'on'}
        <button type="button" class="secondary" onclick={test}>{t('push.test')}</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  section {
    margin: 1rem 0;
  }
  h2 {
    margin: 0 0 0.3rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
</style>
