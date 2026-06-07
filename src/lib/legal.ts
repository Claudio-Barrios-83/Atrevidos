export type LegalLink = {
  href: string;
  label: string;
};

export type LegalSection = {
  title: string;
  body: string[];
};

export type LegalPage = {
  slug: 'privacy' | 'terms' | 'safety';
  href: string;
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  sections: LegalSection[];
};

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: 'privacy',
    href: '/privacy',
    label: 'Privacidad',
    eyebrow: 'Privacidad',
    title: 'Aviso de privacidad',
    summary:
      'Recopilamos los datos mínimos para crear tu perfil, moderar la comunidad y mantener segura una experiencia orientada a personas adultas.',
    sections: [
      {
        title: 'Qué datos usamos',
        body: [
          'Para registrarte e iniciar sesión procesamos tu correo electrónico, credenciales de autenticación y los metadatos mínimos que Supabase necesita para mantener tu cuenta activa de forma segura.',
          'Atrevidos guarda la información que completas en tu perfil, como nombre de usuario, nombre visible, biografía, ubicación, intereses, intención de relación y preferencias de conexión.',
          'También procesamos datos básicos de sesión y actividad para mantener tu acceso, prevenir abuso y mostrar funciones como descubrimiento, matches y mensajería.'
        ]
      },
      {
        title: 'Para qué se usan',
        body: [
          'Usamos estos datos para habilitar tu cuenta, personalizar coincidencias, aplicar normas de seguridad y responder a reportes o incidentes de confianza.',
          'No prometemos anonimato absoluto: si detectamos fraude, acoso, explotación o riesgos para otros usuarios, podremos revisar la información necesaria para moderar la plataforma.'
        ]
      },
      {
        title: 'Tus controles',
        body: [
          'Puedes editar la mayor parte de tu perfil en cualquier momento. Si decides dejar de usar Atrevidos, evita publicar datos sensibles que no quieras compartir con otras personas.',
          'La confirmación de mayoría de edad y el reconocimiento de consentimiento forman parte del onboarding y son obligatorios antes de usar plenamente la plataforma.'
        ]
      }
    ]
  },
  {
    slug: 'terms',
    href: '/terms',
    label: 'Términos y consentimiento',
    eyebrow: 'Consentimiento',
    title: 'Términos y consentimiento',
    summary:
      'Atrevidos es solo para personas adultas. Antes de usar todas las funciones debes confirmar que eres mayor de 18 años y que interactuarás con consentimiento claro.',
    sections: [
      {
        title: 'Mayoría de edad',
        body: [
          'El registro y uso de Atrevidos está limitado a personas mayores de 18 años. Si no cumples este requisito, no debes crear cuenta ni continuar con el onboarding.',
          'La casilla de verificación del onboarding registra que declaras ser mayor de 18 años.'
        ]
      },
      {
        title: 'Consentimiento y conducta',
        body: [
          'Debes buscar consentimiento claro, específico y reversible en tus conversaciones y encuentros. Nada en Atrevidos sustituye acuerdos explícitos entre personas adultas.',
          'El reconocimiento de consentimiento del onboarding confirma que usarás Atrevidos de forma respetuosa y con consentimiento claro en tus interacciones.'
        ]
      },
      {
        title: 'Límites de uso',
        body: [
          'No se permite compartir contenido ilegal, coercitivo, explotador, engañoso o que involucre a menores de edad. Tampoco se permite acosar, presionar o suplantar a otras personas.',
          'Podemos restringir acceso, moderar contenido o cerrar cuentas cuando detectemos incumplimientos o riesgos relevantes para la comunidad.'
        ]
      }
    ]
  },
  {
    slug: 'safety',
    href: '/safety',
    label: 'Seguridad y comunidad',
    eyebrow: 'Seguridad',
    title: 'Guía de seguridad y comunidad',
    summary:
      'Queremos una comunidad adulta, respetuosa y de bajo riesgo. Usa estas pautas antes de conversar, compartir contenido o quedar en persona.',
    sections: [
      {
        title: 'Antes de interactuar',
        body: [
          'Ve despacio, confirma expectativas y evita compartir datos sensibles demasiado pronto. Desconfía de quien te presione para salir de la plataforma, enviar dinero o revelar información privada.',
          'Si algo te incomoda, detén la conversación. El consentimiento puede retirarse en cualquier momento.'
        ]
      },
      {
        title: 'Contenido y encuentros',
        body: [
          'No compartas material de terceros sin permiso ni contenido íntimo si no existe acuerdo claro. Si decides conocer a alguien, prioriza lugares públicos, avisa a una persona de confianza y mantén control sobre tu transporte.',
          'Nunca uses Atrevidos para coaccionar, extorsionar o exponer a otras personas.'
        ]
      },
      {
        title: 'Reportes y autocuidado',
        body: [
          'Si detectas acoso, suplantación, posibles menores, explotación o cualquier conducta peligrosa, repórtala de inmediato por los canales disponibles en la app.',
          'Si crees que existe un riesgo inmediato fuera de la plataforma, contacta a servicios de emergencia o apoyo local antes de esperar respuesta dentro de Atrevidos.'
        ]
      }
    ]
  }
];

export const LEGAL_NOTICE_LINKS: LegalLink[] = LEGAL_PAGES.map(({ href, label }) => ({ href, label }));

export const LEGAL_ROUTE_PATHS = LEGAL_NOTICE_LINKS.map(({ href }) => href);

const legalPagesBySlug = new Map(LEGAL_PAGES.map((page) => [page.slug, page]));

export function getLegalPage(slug: LegalPage['slug']): LegalPage {
  const page = legalPagesBySlug.get(slug);

  if (!page) {
    throw new Error(`Unknown legal page: ${slug}`);
  }

  return page;
}
