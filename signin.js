const get = (id) => document.getElementById(id);
try {
  const account = await import('./social.js');
  get('google').disabled = false;
  get('google').onclick = async () => {
    get('google').disabled = true;
    get('message').textContent = '';
    try {
      get('code').value = await account.makeLoginCode();
      get('code-box').hidden = false;
      get('message').textContent =
        'Код действует две минуты. Вставьте его только в своём приложении.';
    } catch (e) {
      get('message').textContent = e.message;
    } finally {
      get('google').disabled = false;
    }
  };
  get('copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(get('code').value);
      get('message').textContent = 'Код скопирован.';
    } catch {
      get('code').select();
    }
  };
} catch {
  get('message').textContent =
    'Не удалось загрузить форму. Проверьте соединение и обновите страницу.';
}
