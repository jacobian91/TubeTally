// Lightweight English/Spanish localization for the static PWA and dynamic dialogs.
// Only known UI phrases are translated; field names and user-entered content stay intact.
(() => {
  const translations = Object.freeze({
    'TubeTally — Irrigation Row Counter': 'TubeTally — Contador de surcos de riego',
    'Fields': 'Campos', 'Field': 'Campo', 'Field:': 'Campo:', 'New': 'Nuevo',
    'Settings': 'Configuración', 'Local only': 'Solo local', 'Account': 'Cuenta',
    'Started:': 'Inicio:', 'Viewing': 'Viendo', 'History': 'Historial',
    'BACK': 'ATRÁS', 'EXIT VIEW': 'SALIR DE VISTA', 'EDIT': 'EDITAR',
    'Good': 'Bien', 'Slow': 'Lento', 'Fast': 'Rápido',
    'Current Row': 'Surco actual', 'Vibration': 'Vibración', 'Beep': 'Sonido',
    'Keep screen awake': 'Mantener pantalla encendida',
    'Dark theme': 'Tema oscuro', 'Left-handed layout': 'Diseño para zurdos',
    'Language': 'Idioma', 'English': 'Inglés', 'Spanish': 'Español',
    'Block organization invitations': 'Bloquear invitaciones de organizaciones',
    'Install TubeTally': 'Instalar TubeTally',
    'Hold 0.75s to edit': 'Mantén pulsado 0,75 s para editar',
    'Hold to edit row': 'Mantén pulsado para editar el surco',
    'Open TubeTally in Safari first.': 'Primero abre TubeTally en Safari.',
    'In Safari, tap Share (square with an up arrow). If needed, open the Page Menu first.':
      'En Safari, toca Compartir (el cuadrado con una flecha hacia arriba). Si es necesario, abre primero el menú de página.',
    'Select Add to Home Screen.': 'Selecciona Añadir a pantalla de inicio.',
    'Turn on Open as Web App (if shown), then tap Add.':
      'Activa Abrir como app (si aparece) y luego toca Añadir.',
    'The TubeTally icon will appear on your Home Screen.':
      'El icono de TubeTally aparecerá en tu pantalla de inicio.',
    'Use Safari’s Share menu to add TubeTally to your Home Screen.':
      'Usa el menú Compartir de Safari para añadir TubeTally a tu pantalla de inicio.',
    'Open TubeTally in Safari to add it to your Home Screen.':
      'Abre TubeTally en Safari para añadirlo a tu pantalla de inicio.',
    'Checking install support…': 'Comprobando instalación…',
    'Install': 'Instalar', 'Installed': 'Instalado',
    'Clear all data': 'Borrar todos los datos',
    'Field Name': 'Nombre del campo', 'Save to': 'Guardar en',
    'Personal fields': 'Campos personales',
    'Cancel': 'Cancelar', 'Save': 'Guardar', 'Close': 'Cerrar',
    'Organizations': 'Organizaciones',
    'Organization fields are shared with every member.': 'Los campos de la organización se comparten con todos sus miembros.',
    'New organization': 'Nueva organización', 'Create organization': 'Crear organización',
    'Members': 'Miembros', 'Admins can manage membership.': 'Los administradores pueden gestionar miembros.',
    'Invite by email': 'Invitar por correo electrónico', 'Send invitation': 'Enviar invitación',
    'Organization invitation': 'Invitación a la organización',
    'Decline': 'Rechazar', 'Accept': 'Aceptar',
    'Start a new field?': '¿Empezar un campo nuevo?',
    'New field': 'Campo nuevo',
    'Change Row Status': 'Cambiar estado del surco', 'Row:': 'Surco:',
    'Current:': 'Actual:', 'Saved Fields': 'Campos guardados',
    'Saved fields stay on this device.': 'Los campos guardados permanecen en este dispositivo.',
    'Save current field': 'Guardar campo actual', 'Upload local fields': 'Subir campos locales',
    'Resume editing': 'Continuar editando',
    'Show fields from': 'Mostrar campos de',
    'All fields': 'Todos los campos', 'No saved fields yet': 'Aún no hay campos guardados',
    'No fields in this location yet': 'Aún no hay campos aquí',
    'Upload saved fields?': '¿Subir campos guardados?',
    'Choose which fields to add to your TubeTally account. They will also remain on this phone.':
      'Elige los campos que deseas añadir a tu cuenta de TubeTally. También permanecerán en este teléfono.',
    'Not now': 'Ahora no', 'Upload selected': 'Subir seleccionados',
    'Remove saved field?': '¿Eliminar campo guardado?', 'This will remove': 'Esto eliminará',
    'this field': 'este campo', 'from this device and, if synced, your account.':
      'de este dispositivo y, si está sincronizado, de tu cuenta.',
    'Remove': 'Eliminar', 'Load': 'Cargar', 'Share': 'Compartir',
    'Log in to Tube Tally': 'Iniciar sesión en Tube Tally',
    'Use the email address connected to your invited account.':
      'Usa el correo electrónico asociado a tu cuenta invitada.',
    'Log in': 'Iniciar sesión', 'Sign up': 'Registrarse',
    'or use email': 'o usar correo electrónico',
    'Name': 'Nombre', 'Email': 'Correo electrónico', 'Password': 'Contraseña',
    'Forgot password?': '¿Olvidaste tu contraseña?', 'Edit name': 'Editar nombre',
    'Save name': 'Guardar nombre', 'Change email': 'Cambiar correo',
    'New email': 'Nuevo correo electrónico',
    'TubeTally will send a verification link before changing your email.':
      'TubeTally enviará un enlace de verificación antes de cambiar tu correo.',
    'Send verification': 'Enviar verificación',
    'Send password reset email': 'Enviar correo para restablecer contraseña',
    'Log out': 'Cerrar sesión',
    'Copied to clipboard': 'Copiado al portapapeles',
    'Field saved': 'Campo guardado', 'Field updated': 'Campo actualizado',
    'Field removed': 'Campo eliminado', 'Editing field': 'Editando campo',
    'Viewing saved field': 'Viendo campo guardado', 'View only': 'Solo lectura',
    'No rows recorded yet': 'Aún no hay surcos registrados',
    'Exit view mode to save fields': 'Sal de la vista para guardar campos',
    'New field started': 'Campo nuevo iniciado',
    'Report loaded from URL': 'Informe cargado desde el enlace',
    'App installed': 'Aplicación instalada',
    'No fields selected': 'No se seleccionaron campos',
    'Save field': 'Guardar campo', 'Untitled field': 'Campo sin nombre',
    'Saved field': 'Campo guardado',
    'Waiting to sync': 'Esperando sincronización',
    'Autosaved to account': 'Guardado automáticamente en la cuenta',
    'Saved to account': 'Guardado en la cuenta',
    'Local only': 'Solo local', 'Syncing…': 'Sincronizando…',
    'Synced': 'Sincronizado', 'Offline · saved locally': 'Sin conexión · guardado localmente',
    'Sign in to sync': 'Inicia sesión para sincronizar',
    'Sync paused': 'Sincronización pausada',
    'Viewing saved field': 'Viendo campo guardado',
    'No organizations yet.': 'Aún no hay organizaciones.',
    'Manage': 'Administrar',
    'Invitation sent': 'Invitación enviada',
    'Invitation declined': 'Invitación rechazada',
    'Organization invitations blocked': 'Invitaciones de organizaciones bloqueadas',
    'Organization invitations allowed': 'Invitaciones de organizaciones permitidas',
    'Unable to update organization': 'No se pudo actualizar la organización',
    'Admin': 'Administrador', 'Member': 'Miembro',
    'admin': 'administrador', 'member': 'miembro',
    'Block invitations': 'Bloquear invitaciones',
    'Invite': 'Invitar', 'Remove member': 'Eliminar miembro',
    'Promote': 'Ascender', 'Demote': 'Cambiar a miembro',
    'Already a member': 'Ya es miembro',
    'Checking install support…': 'Comprobando instalación…',
    'Ready to install from this browser.': 'Listo para instalar desde este navegador.',
    'Waiting for browser confirmation…': 'Esperando confirmación del navegador…',
    'App is already installed on this device.': 'La aplicación ya está instalada.',
    'Install prompt not available. Use your browser menu if offered.':
      'No se puede instalar directamente. Usa el menú del navegador si está disponible.',
    'Install prompt not available right now. Use your browser menu to install.':
      'La instalación directa no está disponible. Usa el menú del navegador.',
    'Install prompt accepted. Waiting for browser…':
      'Instalación aceptada. Esperando al navegador…',
    'Install dismissed. You can try again later.':
      'Instalación cancelada. Puedes volver a intentarlo.',
    'Install failed. Try again later.': 'Falló la instalación. Inténtalo de nuevo.',
    'Clear all data?': '¿Borrar todos los datos?',
    'Clear everything': 'Borrar todo',
    'This removes fields, preferences, and cached versions from this device. Data already synced to your account stays online.':
      'Se borrarán los campos, preferencias y caché de este dispositivo. Los datos sincronizados permanecerán en tu cuenta.',
    'Confirm': 'Confirmar', 'Yes': 'Sí', 'No': 'No',
    'Enter your name.': 'Introduce tu nombre.',
    'Check your email for a password reset link': 'Revisa tu correo para restablecer la contraseña',
    'Check your email to confirm your account': 'Revisa tu correo para confirmar tu cuenta',
    'Check your email for a reset link': 'Revisa tu correo para obtener el enlace de recuperación',
    'Logged in': 'Sesión iniciada', 'Logged out': 'Sesión cerrada',
    'Tube Tally account created': 'Cuenta de Tube Tally creada',
    'Password updated': 'Contraseña actualizada',
    'Select all': 'Seleccionar todo', 'Selected': 'Seleccionado',
    'Login': 'Iniciar sesión', 'Sign in': 'Iniciar sesión',
    'Reset password': 'Restablecer contraseña',
    'Account settings': 'Configuración de la cuenta',
    'Personal': 'Personal', 'Current field': 'Campo actual',
    'Delete': 'Eliminar', 'Download': 'Descargar',
    'Saved fields are available on this phone and in your account.':
      'Los campos guardados están disponibles en este teléfono y en tu cuenta.',
    'Select fields to upload': 'Selecciona campos para subir',
    'Account fields': 'Campos de la cuenta',
    'Field reports': 'Informes de campo',
    'Row': 'Surco', 'Date': 'Fecha', 'Status': 'Estado',
    'Edit': 'Editar', 'Done': 'Listo',
    'Joined': 'Te uniste', 'Invite sent': 'Invitación enviada'
  });

  const previousText = new WeakMap();
  const previousAttrs = new WeakMap();
  let language = 'en';

  function translate(source) {
    const core = source.trim();
    if (!core) return source;
    let translated = translations[core];
    if (translated === undefined) {
      let match;
      if ((match = /^Saved (.+)$/.exec(core))) translated = 'Guardado ' + match[1];
      else if ((match = /^Viewing (.+)$/.exec(core))) translated = 'Viendo ' + match[1];
      else if ((match = /^Hold to edit row (\d+)$/.exec(core))) translated = 'Mantén pulsado para editar el surco ' + match[1];
      else if ((match = /^(.+) created$/.exec(core))) translated = match[1] + ' creada';
      else if ((match = /^Joined (.+)$/.exec(core))) translated = 'Te uniste a ' + match[1];
      else if ((match = /^Join (.+)\? All fields saved there are shared with the organization\.$/.exec(core)))
        translated = '¿Unirte a ' + match[1] + '? Todos los campos guardados allí se comparten con la organización.';
      else if ((match = /^(\d+) fields? queued for upload$/.exec(core)))
        translated = match[1] + ' campos pendientes de subir';
      else if ((match = /^(\d+) members? · (admin|member)$/.exec(core)))
        translated = match[1] + ' miembros · ' + translations[match[2]];
      else if ((match = /^(\d+) changes? waiting to sync$/.exec(core)))
        translated = match[1] + ' cambios pendientes de sincronizar';
    }
    if (translated === undefined) return source;
    const start = source.indexOf(core);
    return source.slice(0, start) + translated + source.slice(start + core.length);
  }

  function visitText(node) {
    if (!node || !node.parentElement || node.parentElement.closest('script, style, noscript')) return;
    const current = node.nodeValue;
    const prior = previousText.get(node);
    const source = prior && current === prior.rendered ? prior.source : current;
    const rendered = language === 'es' ? translate(source) : source;
    previousText.set(node, { source, rendered });
    if (current !== rendered) node.nodeValue = rendered;
  }

  function visitAttributes(element) {
    if (!element || element.nodeType !== 1) return;
    let record = previousAttrs.get(element);
    if (!record) { record = {}; previousAttrs.set(element, record); }
    for (const name of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      const prior = record[name];
      const source = prior && prior.rendered === current ? prior.source : current;
      const rendered = language === 'es' ? translate(source) : source;
      record[name] = { source, rendered };
      if (current !== rendered) element.setAttribute(name, rendered);
    }
  }

  function visit(node) {
    if (!node) return;
    if (node.nodeType === 3) { visitText(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) visitAttributes(node);
    const tree = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (tree.nextNode()) {
      const child = tree.currentNode;
      if (child.nodeType === 3) visitText(child);
      else visitAttributes(child);
    }
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') visitText(record.target);
      else if (record.type === 'attributes') visitAttributes(record.target);
      else for (const node of record.addedNodes) visit(node);
    }
  });

  window.tubeTallyI18n = {
    setLanguage(next) {
      language = next === 'es' ? 'es' : 'en';
      document.documentElement.lang = language;
      visit(document.body);
    },
    getLanguage() { return language; },
    translate,
  };
  observer.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['title', 'aria-label', 'placeholder'],
  });
})();
