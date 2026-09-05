import {
  AuthError,
  MissingIdentityError,
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
  requestPasswordRecovery,
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

let currentUser = null;
let mode = 'login';
let callbackToken = null;

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

function renderAccountButton() {
  accountButton.textContent = currentUser ? displayName(currentUser) : 'Log in';
  accountButton.title = currentUser ? `Signed in as ${currentUser.email}` : 'Log in to Tube Tally';
}

function setMode(nextMode) {
  mode = nextMode;
  setError();
  form.reset();
  accountDetails.classList.add('hidden');
  form.classList.remove('hidden');
  const hidesEmail = nextMode === 'invite' || nextMode === 'reset';
  const hidesPassword = nextMode === 'recover';
  emailGroup.classList.toggle('hidden', hidesEmail);
  emailInput.disabled = hidesEmail;
  passwordGroup.classList.toggle('hidden', hidesPassword);
  passwordInput.disabled = hidesPassword;
  forgotButton.classList.toggle('hidden', nextMode !== 'login');
  logoutButton.classList.add('hidden');

  const content = {
    login: ['Log in to Tube Tally', 'Use the email address connected to your invited account.', 'Log in'],
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
forgotButton.addEventListener('click', () => setMode('recover'));
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

dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) dialog.close();
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
}

initializeAuth();
