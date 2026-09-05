import {
  AuthError,
  MissingIdentityError,
  acceptInvite,
  getSettings,
  getUser,
  handleAuthCallback,
  login,
  logout,
  oauthLogin,
  onAuthChange,
  requestPasswordRecovery,
  signup,
  updateUser,
} from '@netlify/identity';

const accountButton = document.getElementById('accountBtn');
const dialog = document.getElementById('authDialog');
const form = document.getElementById('authForm');
const title = document.getElementById('authTitle');
const description = document.getElementById('authDescription');
const emailGroup = document.getElementById('authEmailGroup');
const emailInput = document.getElementById('authEmail');
const passwordGroup = document.getElementById('authPasswordGroup');
const passwordInput = document.getElementById('authPassword');
const submitButton = document.getElementById('authSubmit');
const forgotButton = document.getElementById('authForgot');
const logoutButton = document.getElementById('authLogout');
const errorMessage = document.getElementById('authError');
const accountDetails = document.getElementById('authAccountDetails');
const accountAvatar = document.getElementById('accountAvatar');
const accountName = document.getElementById('accountName');
const oauthSection = document.getElementById('authOauthSection');
const oauthButtons = document.getElementById('authOauthButtons');
const modeTabs = document.getElementById('authModeTabs');
const loginModeButton = document.getElementById('authLoginMode');
const signupModeButton = document.getElementById('authSignupMode');
const nameGroup = document.getElementById('authNameGroup');
const nameInput = document.getElementById('authName');

let currentUser = null;
let mode = 'login';
let callbackToken = null;
let hasOauthProviders = false;
let signupEnabled = false;

const PROVIDER_LABELS = {
  google: 'Google',
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

function showNotice(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
}

function friendlyError(error) {
  if (error instanceof MissingIdentityError) return 'Tube Tally accounts are not enabled for this deploy yet.';
  if (error instanceof AuthError && error.status === 401) return 'Incorrect email or password.';
  if (error instanceof AuthError && error.status === 422) return 'Please check the information and try again.';
  return error?.message || 'Something went wrong. Please try again.';
}

function setError(message = '') {
  errorMessage.textContent = message;
  errorMessage.classList.toggle('hidden', !message);
}

function displayName(user) {
  return user?.user_metadata?.full_name || user?.name || user?.email || 'Account';
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function renderAccountButton() {
  const name = currentUser ? displayName(currentUser) : '';
  accountAvatar.textContent = currentUser ? initials(name) : '';
  if (!currentUser) {
    accountAvatar.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>';
  }
  accountName.textContent = currentUser ? name : 'Account';
  accountName.classList.toggle('hidden', !currentUser);
  accountButton.title = currentUser ? `Signed in as ${currentUser.email}` : 'Log in to Tube Tally';
  accountButton.setAttribute('aria-label', currentUser ? `Account for ${name}` : 'Log in or sign up');
}

function renderOauthProviders(settings) {
  oauthButtons.replaceChildren();
  const providers = Object.entries(settings.providers || {})
    .filter(([provider, enabled]) => enabled && provider !== 'email' && PROVIDER_LABELS[provider])
    .map(([provider]) => provider);

  for (const provider of providers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn w-full justify-center border border-gray-300 dark:border-gray-600 font-bold';
    button.textContent = `Continue with ${PROVIDER_LABELS[provider]}`;
    button.addEventListener('click', () => oauthLogin(provider));
    oauthButtons.appendChild(button);
  }

  hasOauthProviders = providers.length > 0;
  oauthSection.classList.toggle('hidden', !hasOauthProviders || !['login', 'signup'].includes(mode));
  modeTabs.classList.toggle('hidden', !signupEnabled || !['login', 'signup'].includes(mode));
}

function setMode(nextMode) {
  mode = nextMode;
  setError();
  form.reset();
  accountDetails.classList.add('hidden');
  form.classList.remove('hidden');
  const hidesEmail = nextMode === 'invite' || nextMode === 'reset';
  const hidesPassword = nextMode === 'recover';
  const asksForName = nextMode === 'signup';
  const showsModeTabs = signupEnabled && ['login', 'signup'].includes(nextMode);
  nameGroup.classList.toggle('hidden', !asksForName);
  nameInput.disabled = !asksForName;
  emailGroup.classList.toggle('hidden', hidesEmail);
  emailInput.disabled = hidesEmail;
  passwordGroup.classList.toggle('hidden', hidesPassword);
  passwordInput.disabled = hidesPassword;
  forgotButton.classList.toggle('hidden', nextMode !== 'login');
  modeTabs.classList.toggle('hidden', !showsModeTabs);
  loginModeButton.setAttribute('aria-selected', String(nextMode === 'login'));
  signupModeButton.setAttribute('aria-selected', String(nextMode === 'signup'));
  oauthSection.classList.toggle('hidden', !hasOauthProviders || !['login', 'signup'].includes(nextMode));
  logoutButton.classList.add('hidden');

  const content = {
    login: ['Log in to Tube Tally', 'Use your Tube Tally account to continue.', 'Log in'],
    signup: ['Create your Tube Tally account', 'Create an account to save and share field reports.', 'Create account'],
    recover: ['Reset your password', 'We’ll email you a secure password-reset link.', 'Send reset link'],
    reset: ['Choose a new password', 'Enter a new password for your Tube Tally account.', 'Save password'],
    invite: ['Finish your Tube Tally account', 'Choose a password to accept your invitation.', 'Create account'],
  }[nextMode];
  [title.textContent, description.textContent, submitButton.textContent] = content;
  passwordInput.autocomplete = nextMode === 'login' ? 'current-password' : 'new-password';
}

function showAccount() {
  setError();
  form.classList.add('hidden');
  accountDetails.classList.remove('hidden');
  title.textContent = displayName(currentUser);
  description.textContent = currentUser.email;
  logoutButton.classList.remove('hidden');
}

function openDialog() {
  if (currentUser && mode !== 'reset') showAccount();
  else if (mode !== 'invite' && mode !== 'reset') setMode('login');
  dialog.showModal();
}

async function processCallback() {
  try {
    const result = await handleAuthCallback();
    if (!result) return;
    callbackToken = result.token || null;
    currentUser = result.user || currentUser;

    if (result.type === 'invite') {
      setMode('invite');
      openDialog();
    } else if (result.type === 'recovery') {
      setMode('reset');
      openDialog();
    } else if (result.type === 'confirmation') {
      showNotice('Email confirmed');
    } else if (result.type === 'oauth') {
      showNotice('Logged in');
    } else if (result.type === 'email_change') {
      showNotice('Email address updated');
    }
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  } catch (error) {
    setMode('login');
    setError(friendlyError(error));
    openDialog();
  }
}

accountButton.addEventListener('click', openDialog);
loginModeButton.addEventListener('click', () => setMode('login'));
signupModeButton.addEventListener('click', () => setMode('signup'));
forgotButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  setMode('recover');
  requestAnimationFrame(() => {
    if (!dialog.open) dialog.showModal();
  });
});
logoutButton.addEventListener('click', async () => {
  try {
    await logout();
    currentUser = null;
    renderAccountButton();
    dialog.close();
    showNotice('Logged out');
  } catch (error) {
    setError(friendlyError(error));
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError();
  submitButton.disabled = true;

  try {
    if (mode === 'login') {
      currentUser = await login(emailInput.value.trim(), passwordInput.value);
      dialog.close();
      showNotice('Logged in');
    } else if (mode === 'signup') {
      currentUser = await signup(emailInput.value.trim(), passwordInput.value, {
        full_name: nameInput.value.trim(),
      });
      dialog.close();
      showNotice(currentUser.emailVerified ? 'Tube Tally account created' : 'Check your email to confirm your account');
    } else if (mode === 'recover') {
      await requestPasswordRecovery(emailInput.value.trim());
      dialog.close();
      showNotice('Check your email for a reset link');
    } else if (mode === 'reset') {
      currentUser = await updateUser({ password: passwordInput.value });
      dialog.close();
      showNotice('Password updated');
      mode = 'login';
    } else if (mode === 'invite') {
      currentUser = await acceptInvite(callbackToken, passwordInput.value);
      callbackToken = null;
      mode = 'login';
      dialog.close();
      showNotice('Tube Tally account created');
    }
    renderAccountButton();
  } catch (error) {
    setError(friendlyError(error));
  } finally {
    submitButton.disabled = false;
  }
});

onAuthChange((_event, user) => {
  currentUser = user;
  renderAccountButton();
});

async function initializeAuth() {
  await processCallback();
  currentUser = (await getUser()) || currentUser;
  renderAccountButton();
  try {
    const settings = await getSettings();
    signupEnabled = !settings.disableSignup;
    renderOauthProviders(settings);
  } catch (error) {
    console.warn('Unable to load enabled login providers', error);
  }
}

initializeAuth();
