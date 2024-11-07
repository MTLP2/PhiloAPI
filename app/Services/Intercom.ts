import Env from '@ioc:Adonis/Core/Env'

import Production from 'App/Services/Production'
import Utils from 'App/Utils'
import Auth from 'App/Services/Auth'
import User from 'App/Services/User'
import Project from 'App/Services/Project'

// TYPES
type CardComponentItem = {
  type: string
  id: string
  title: string
  subtitle: string | string[]
  tertiary_text?: string
  image?: string
  image_height?: number
  image_width?: number
}

type CardComponentSubmitAction = {
  type: 'submit'
}

type CardComponentURLAction = {
  type: 'url'
  url: string
}

type CardComponentList = {
  type: 'list'
  items: CardComponentItem[]
}

type CardComponentDataTableItem = {
  type: 'field-value'
  field: string
  value: string
}

type CardComponentDataTable = {
  type: 'data-table'
  items: CardComponentDataTableItem[]
}

type CardComponent = {
  type: 'spacer' | 'text' | 'image' | 'button' | 'divider' | 'item' | 'list' | 'data-table'
  text?: string | string[]
  style?: string
  url?: string
  height?: number
  width?: number
  items?: CardComponentItem[] | CardComponentDataTableItem[]
  size?: 'xs' | 's' | 'm' | 'l' | 'xl'
  bottom_margin?: 'none'
  id?: string
  label?: string
  action?: CardComponentSubmitAction | CardComponentURLAction
}[]

// Translates an order step into a human readable string
const translate: (key: string, lang?: 'FR' | 'EN', payload?: string) => string | string[] = (
  key,
  lang = 'EN',
  payload
) => {
  const wording = {
    // Error
    error:
      lang === 'EN'
        ? '🤔 Oops! An error has occurred.'
        : '🤔 Oups, nous avons rencontré une erreur.',
    error_message:
      lang === 'EN'
        ? 'Can you please wait for a few minutes or contact support by writing your message below? Thank you!'
        : 'Pouvez-vous patienter quelques minutes ou contacter le support en écrivant votre message ci-dessous ? Merci !',
    error_account_fail:
      lang === 'EN'
        ? "🤔 Oops, unfortunately it's wrong again"
        : '🤔 Oups, ce n’est toujours pas ça, malheureusement.',
    error_account_fail_message:
      lang === 'EN'
        ? "You've reached maximum retries. Please contact the customer support below. We'll get back to you shortly. Thank you!"
        : 'Veuillez contacter le service client ci-dessous. Nous reviendrons vers vous prochainement. Merci !',

    // Order - Init
    order_init:
      lang === 'EN' ? '💼 What do you want to do?' : '💼 Quelles informations souhaitez-vous ?',
    order_choice:
      lang === 'EN' ? 'I want details on my orders' : 'Je veux des informations sur mes commandes',
    download_choice:
      lang === 'EN'
        ? 'I want to redeem a download code'
        : 'Je veux utiliser un code de téléchargement',
    box_choice:
      lang === 'EN' ? 'I want details on my boxes' : 'Je veux des informations sur ma box',

    // Countries
    country_fr: 'France',
    country_us: lang === 'EN' ? 'United States' : 'États-Unis',
    country_uk: lang === 'EN' ? 'United Kingdom' : 'Royaume-Uni',
    country_de: lang === 'EN' ? 'Germany' : 'Allemagne',
    country_au: lang === 'EN' ? 'Australia' : 'Australie',
    country_es: lang === 'EN' ? 'Spain' : 'Espagne',

    // Order - Common
    order: lang === 'EN' ? 'Order' : 'Commande',
    quantity: lang === 'EN' ? 'Quantity' : 'Quantité',
    shipping: lang === 'EN' ? 'Shipping' : 'Livraison',
    paid: lang === 'EN' ? 'Paid' : 'Payé',
    total: lang === 'EN' ? 'Total (incl. ship.)' : 'Total (livr. incluse)',
    refund_text: lang === 'EN' ? 'Refunded' : 'Remboursé',
    date_shipping: lang === 'EN' ? 'Estimated shipping date' : "Date d'expédition estimée",
    cancelled: lang === 'EN' ? 'Cancelled' : 'Annulé',
    tracking_link_available: lang === 'EN' ? 'Tracking Link' : 'Lien de tracking',
    yes: lang === 'EN' ? 'Yes' : 'Oui',
    no: lang === 'EN' ? 'No' : 'Non',
    order_step: lang === 'EN' ? 'Order status' : 'Statut de la commande',
    many_orders:
      lang === 'EN'
        ? 'You have several orders (thanks!), please select one:'
        : 'Vous avez plusieurs commandes (merci !), votre demande concerne :',
    no_orders:
      lang === 'EN'
        ? 'Sorry, it seems that you haven’t ordered yet. We recommend that you login to the account used to order. Thanks!'
        : 'Vous n’avez pas (encore) de commande chez nous. Nous vous invitons à retrouver vos identifiants ou contacter le support. Merci !',
    see_other_orders: lang === 'EN' ? 'See other orders' : "Voir d'autres commandes",
    back_to_orders: lang === 'EN' ? 'Back to orders' : 'Retour aux commandes',
    sent_orders:
      lang === 'EN'
        ? 'Delivered or delivery in progress'
        : 'Commandes en cours de livraison ou livrées',
    current_orders: lang === 'EN' ? 'Orders in production' : 'Commandes en cours de production',
    all_orders: lang === 'EN' ? 'All orders' : 'Toutes les commandes',
    multiple_orders:
      lang === 'EN'
        ? 'You have orders currently in production and others in delivery. Which ones would you like to consult?'
        : 'Vous avez des commandes en cours de production, et d’autres en cours de livraison. Lesquelles souhaitez-vous consulter ?',
    got_tracking_link:
      lang === 'EN' ? 'You have a tracking link! 😎' : 'Vous avez un lien de suivi ! 😎',
    see_tracking_link: lang === 'EN' ? '🔗 See tracking link' : '🔗 Voir le lien de tracking',
    no_tracking_link:
      lang === 'EN'
        ? "The tracking link is not yet available, unfortunately. We'll share it with you once your order is shipped. Thank you!"
        : 'Le lien de suivi n’est pas encore disponible, malheureusement. Nous vous le communiquerons lorsque votre commande sera expédiée. Merci !',
    type_order: lang === 'EN' ? 'Type' : 'Type',
    type_shop: lang === 'EN' ? 'Immediate shipment' : 'Expédition immédiate',
    type_vod: lang === 'EN' ? 'Preorder' : 'Précommande',
    shipment_origin: lang === 'EN' ? 'Ship from' : 'Expédié depuis',
    resend_check_address:
      lang === 'EN' ? 'I have not received this email' : "Je n'ai pas reçu l'email",
    check_address_details:
      lang === 'EN'
        ? 'Check your spam for your order address confirmation. If you haven’t received our mail, we can resend you a new one now:'
        : "Vérifiez dans vos spams la confirmation de l'adresse de votre commande. Si vous n'avez pas reçu ce courrier, nous pouvons vous en envoyer un nouveau maintenant :",
    check_address_link: lang === 'EN' ? '🔗 Go to your account' : '🔗 Aller à votre compte',
    main_order_menu: lang === 'EN' ? 'Back to main menu' : 'Retour au menu principal',

    // Order -> Production details
    preprod: lang === 'EN' ? 'Pre-production' : 'Production en attente',
    preprod_description:
      lang === 'EN'
        ? 'Your purchase has been confirmed and the project will begin, thank you! We are gathering all the elements provided by the artist in order to start the pressing phase in the factory as soon as possible. You will receive emails to inform you of the project’s progress. Thank you!'
        : 'Votre achat a été confirmé, le projet va débuter, merci ! Nous rassemblons tous les éléments fournis par l’artiste afin de pouvoir débuter la phase de pressage en usine au plus vite. Vous recevrez des emails pour vous informer de son évolution. Merci !',
    prod: lang === 'EN' ? 'Production in progress' : 'Production en cours',
    prod_description:
      lang === 'EN'
        ? 'The pressing of your vinyl record is in progress, thanks to your purchase! In a few weeks we will send you an email to let you know when this step is over. Next steps are: order preparation, and delivery. Thank you!'
        : 'Le pressage en usine suit son cours grâce à votre achat ! Dans quelques semaines, nous vous enverrons un email pour vous informer de la fin de cette étape. Les prochaines étapes sont : préparation de votre commande, puis livraison. Merci !',
    postprod: lang === 'EN' ? 'Post-production' : 'Post-production',
    postprod_description:
      lang === 'EN'
        ? 'Here we are, the pressing of your vinyl record is almost over or already done! You will receive an email to ask you to confirm your postal address soon, and then to inform you of the delivery. Thank you!'
        : 'On y est, le pressage en usine de votre commande touche bientôt à sa fin ou est déjà terminé ! Vous recevrez un e-mail prochainement pour vous demander de confirmer votre adresse postale, puis pour vous informer de la livraison. Merci !',
    // prodend: lang === 'EN' ? 'Production ended' : 'Production terminée',
    // prodend_description: lang === 'EN' ? 'The factory has finished the production of this vinyl. You will receive a notification when it is ready.' : 'La production de ce vinyl est terminée. Vous recevrez une notification lorsque celui-ci sera prêt.',
    prod_shipping: lang === 'EN' ? 'Estimated shipping date' : "Date d'expédition estimée",
    prod_shipping_description:
      lang === 'EN'
        ? `The estimated shipping date of your record is: ${payload}. Thank you for your patience and support! 🎶`
        : `La date d’expedition estimée est : ${payload}. Merci pour votre patience et soutien ! 🎶`,

    // Order -> Currencies
    EUR: ' €',
    USD: '$',
    AUD: '$A',
    CAD: '$C',
    PHP: '₱',
    KRW: '₩',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',

    // Order -> Status / Step
    sent:
      lang === 'EN'
        ? 'Your order is currently in transit or already delivered. Check the tracking link below to know more:'
        : 'Votre commande est en cours de livraison ou a déjà été livrée. Consultez le lien de tracking ci-dessous:',
    creating:
      lang === 'EN'
        ? [
            'Your order has been registered, we are waiting for confirmation of payment. Once validated, your purchase will allow us to launch the production in the factory.',
            'Thank you!'
          ]
        : [
            'Votre commande a été enregistrée, nous attendons confirmation de paiement. Votre achat une fois validé, nous permettra de lancer la production en usine.',
            ' Merci !'
          ],
    refunded:
      lang === 'EN'
        ? 'Your order has been refunded. The amount appears in your bank account in the following days. If it was a mistake and you did not want a refund, please contact our customer support.'
        : 'Votre commande a été remboursée. Le montant apparaîtra dans les jours qui suivent sur votre compte bancaire. Si c’était une erreur et que vous ne vouliez pas un remboursement, merci de contacter notre service client.',
    failed:
      lang === 'EN'
        ? 'The payment of your order has failed, unfortunately. We invite you to try again or contact your bank for more information.'
        : "Le paiement de votre commande a malheureusement échoué. Nous vous invitons à essayer de nouveau ou à vous tourner vers votre banque pour plus d'informations.",
    canceled:
      lang === 'EN'
        ? [
            'Your order has been canceled 😢.',
            'If it’s an error, please contact our customer support.'
          ]
        : [
            'Votre commande a été annulée 😢.',
            'Si cela est une erreur, merci de contacter notre service client.'
          ],
    check_address:
      lang === 'EN'
        ? [
            'Your order has left the factory, and is almost ready for delivery!',
            'To avoid a delivery failure, we have sent you an email to confirm your address. Thank you for your reactivity. It is possible to change your address for 2 days maximum after the reception of the email.',
            'Without any answer from you, we will send your parcel to the address you provided.',
            'Thank you for your cooperation! 😊'
          ]
        : [
            "Votre commande est sortie de l'usine, et est presque prête pour la livraison !",
            'Pour éviter un échec de livraison, nous vous avons envoyé un e-mail afin que vous nous confirmiez votre adresse. Merci pour votre réactivité, il est possible de changer votre adresse pendant 2 jours maximum après la réception de cet email.',
            'Sans réponse de votre part, nous enverrons votre colis à l’adresse que vous avez renseignée.',
            'Merci pour votre collaboration ! 😊'
          ],
    confirmed_vod:
      lang === 'EN'
        ? [
            'Your payment has been successfully completed, thank you!',
            'Your product is in the pre-order stage: you will be notified either when the project is launched or when it is cancelled. If the project is launched, the next steps are: factory pressing, logistic preparation, and delivery.',
            'Thank you for your patience! 💪'
          ]
        : [
            'Votre paiement a été réalisé avec succès, merci !',
            'Votre produit est à l’étape de pré-commande : vous serez informé soit du lancement du projet soit de son annulation. Si le projet est lancé, les prochaines étapes sont : le pressage en usine, la préparation logistique, et la livraison.',
            'Merci pour votre patience ! 💪'
          ],
    confirmed_shop:
      lang === 'EN'
        ? [
            'Your payment has been successfully completed, thank you!',
            'Your product is in immediate shipment: you will soon receive an email to confirm your address before delivery.',
            'Thank you for your patience! 💪'
          ]
        : [
            'Votre paiement a été réalisé avec succès, merci !',
            'Votre produit est en expédition immédiate : vous recevrez bientôt un email pour confirmer votre adresse avant livraison.',
            'Merci pour votre patience ! 💪'
          ],
    in_production:
      lang === 'EN'
        ? ['Thanks to your purchase this project is in production!', 'Thank you!']
        : ['Grâce à votre achat ce projet est en cours de production !', 'Merci !'],
    returned:
      lang === 'EN'
        ? [
            'Unfortunately, your order is being returned to our logistics center. Several reasons can explain this:: the parcel stayed too long at the pickup point, your address was wrong, or you were absent.',
            'You can check the tracking link for more information.',
            'You will receive an e-mail as soon as the order is received by our logistics center.'
          ]
        : [
            'Malheureusement, votre commande est en retour vers notre centre logistique pour plusieurs raisons : elle est restée trop longtemps au point de retrait, votre adresse était erronée, ou vous étiez absent(e).',
            "Vous pouvez consulter le lien de suivi pour plus d'informations.",
            'Vous recevrez un e-mail dès que celle-ci sera réceptionnée par notre centre logistique.'
          ],
    refund:
      lang === 'EN'
        ? [
            'We have refunded your order.',
            'This follows either a request from you or a project cancellation because it unfortunately did not reach its funding goal.',
            'The amount appears on your bank account within a few days.'
          ]
        : [
            'Nous avons procédé au remboursement de votre commande.',
            'Ceci fait suite soit à une demande de votre part, soit parce que le projet a été annulé car il n’a malheureusement pas atteint son objectif de financement.',
            'Le montant apparaît sur votre compte bancaire dans les jours qui suivent.'
          ],
    test_pressing_ok:
      lang === 'EN'
        ? [
            'Your vinyl record’s pressing is in progress!',
            'The next steps are: order preparation, and delivery (please check your address).',
            'Thank you!'
          ]
        : [
            'Le pressage de votre vinyle suit son cours !',
            'Les prochaines étapes sont : préparation de votre commande puis la livraison (merci de vérifier votre adresse).',
            'Merci !'
          ],
    in_preparation:
      lang === 'EN'
        ? [
            'Your order is being prepared in our logistics center. It will be delivered to you as soon as possible, depending on the distance between our warehouses and your address.',
            'Emails will be sent to inform you of the delivery. Thank you!'
          ]
        : [
            'Votre commande est en cours de préparation dans notre centre logistique.',
            'Elle vous sera transmise au plus vite, selon la distance entre nos entrepôts et votre adresse. Des e-mails vous seront envoyés pour vous informer de la livraison. Merci !'
          ],
    test_pressing_ko:
      lang === 'EN'
        ? [
            'We are sorry, the "Test Pressing" vinyl record which is the basis for the whole production has not been approved by everyone because it is not satisfactory.',
            'We will produce a new "Test Pressing" in order to make the project as good as possible so that it meets our quality standards.',
            'Thank you for your patience.'
          ]
        : [
            'Nous sommes désolés, le vinyle “Test Pressing” qui sert de base à toute la production n’a pas été validé par les différentes parties car il n’est pas satisfaisant.',
            'Nous allons produire un nouveau “Test Pressing” afin que le projet soit aussi réussi que possible et qu’il corresponde à nos standards de qualité.',
            'Merci pour votre patience.'
          ],
    dispatched:
      lang === 'EN'
        ? [
            "Good news, your vinyl has been pressed and is out of the factory! It's on its way to our logistics center, which will prepare your order and ship it to you. The next steps are: order preparation, and shipping.",
            'Thank you!'
          ]
        : [
            'Bonne nouvelle, votre vinyle a été pressé et est sorti d’usine ! Il est en route vers notre centre logistique qui préparera votre commande et vous l’expédiera. Les prochaines étapes sont : préparation de votre commande, et expédition.',
            'Merci !'
          ],
    date_shipping_description:
      lang === 'EN'
        ? 'You should receive your vinyl on the indicated date. You will be informed if any incidents occur and extend this delay (factory malfunction, lack of raw material, etc.)'
        : 'Vous devriez recevoir votre vinyle à la date indiquée. Vous serez informé si des incidents allongent ce délai (dysfonctionnement de l’usine, manque de matière première, etc.).',
    delivered:
      lang === 'EN'
        ? 'Good news, your order has been delivered to the scheduled delivery point. Your vinyl record is waiting for you!'
        : 'Bonne nouvelle, votre commande a été livrée au point de livraison prévu. Votre vinyle vous attend !',
    pickup_available:
      lang === 'EN'
        ? 'Good news, your order is available at the pickup point! You have 14 days to pick it up. Thanks!'
        : 'Bonne nouvelle, votre commande est disponible en point relais ! Vous disposez de 14 jours pour aller la récupérer. Merci !',
    pickup_still_available:
      lang === 'EN'
        ? 'Hello, your order is still waiting for you at the pickup point! You only have a few days left to pick it up. Thank you!'
        : 'Bonjour, votre commande vous attend toujours au point relais ! Il ne vous reste que quelques jours pour aller la récupérer. Merci !',

    // Orders -> download codes
    download_code_header:
      lang === 'EN'
        ? 'The following projects offer tracks in digital format:'
        : 'Les projets suivants offrent des morceaux au format numérique :',
    redeem_download_code:
      lang === 'EN' ? 'Redeem download code' : 'Obtenir un code de téléchargement',
    code_download_used:
      lang === 'EN' ? 'This code has already been used.' : 'Ce code a déjà été utilisé.',
    code_download_helper:
      lang === 'EN'
        ? 'Please click on this link to download your project.'
        : 'Merci de cliquer sur ce lien pour télécharger votre projet.',
    code_download_link: lang === 'EN' ? '🔗 Download link' : '🔗 Lien de téléchargement',
    no_downloadables:
      lang === 'EN'
        ? "The following projects don't offer tracks in digital format."
        : 'Les projets suivants n’offrent pas les morceaux au format numérique.',

    // Account - Common
    account_header:
      lang === 'EN'
        ? 'Let’s try to find your account! 😊'
        : 'Nous allons essayer de retrouver votre compte ensemble 😊',
    enter_email:
      lang === 'EN'
        ? 'Can you fill in the email address used for the order? '
        : "Pouvez-vous renseigner l'adresse e-mail utilisée pour la commande ?",
    email_regex:
      lang === 'EN'
        ? 'Something went wrong 😢 Could you enter a valid email address please ?'
        : 'Quelque chose ne va pas 😢 Pouvez-vous entrer une adresse mail valide s’il vous plaît ?',
    email_not_found:
      lang === 'EN'
        ? 'This email address is unfortunately not associated with any account 😔. Please try another one!'
        : 'Cette adresse e-mail n’est malheureusement associée à aucun compte 😔. Essayez-en une autre !',
    email_try_again:
      lang === 'EN'
        ? 'Could you please try again with another email address?'
        : 'Pourriez-vous réessayer avec une autre adresse mail ?',
    email_found:
      lang === 'EN'
        ? 'Bullseye! This email address is correct. 😎'
        : 'Bingo ! Cette adresse est correcte. 😎',
    email_found_helper:
      lang === 'EN'
        ? 'To check your orders, *log in* and go to *"Orders"*.'
        : 'Pour consulter vos commandes, *identifiez-vous* et allez sur *“Commandes”*.',

    // Account - Forgot password
    forgot_password:
      lang === 'EN'
        ? '🤔 Forgotten password ? Create a new one with the link below'
        : '🤔 Mot de passe oublié ? Réinitialisez-le en cliquant sur le bouton ci-dessous.',
    forgot_password_link:
      lang === 'EN' ? '🔗 Create a new password' : '🔗 Créer un nouveau mot de passe',
    forgot_password_header:
      lang === 'EN'
        ? 'An email has been sent with a link to create a new password'
        : "Un email vient de vous être envoyé. Merci de cliquer sur le lien dans l'email pour réinitialiser votre mot de passe.",
    forgot_password_helper:
      lang === 'EN'
        ? 'Once you have reset your password, you can log in again.'
        : 'Une fois votre mot de passe réinitialisé, vous pourrez vous connecter avec votre nouveau mot de passe.',

    // Box
    box_header:
      lang === 'EN'
        ? '📦 On which box do you need more details?'
        : '📦 À propos de quelle box souhaitez-vous obtenir des informations ?',
    no_boxes:
      lang === 'EN'
        ? "🤔 We couldn't find any box linked to your account."
        : '🤔 Nous n’avons trouvé aucune box liée à votre compte.',
    box_status: lang === 'EN' ? 'Status' : 'Statut',
    box_type_one: lang === 'EN' ? 'One' : 'One',
    box_type_two: lang === 'EN' ? 'Two' : 'Two',
    box_period_1_month: lang === 'EN' ? '1 month' : '1 mois',
    box_period_1_months: lang === 'EN' ? '1 month' : '1 mois',
    box_period_3_months: lang === 'EN' ? '3 months' : '3 mois',
    box_period_6_months: lang === 'EN' ? '6 months' : '6 mois',
    box_period_12_months: lang === 'EN' ? '12 months' : '12 mois',
    box_period_monthly: lang === 'EN' ? 'Monthly' : 'Mensuel',
    box_step_confirmed: lang === 'EN' ? '🟢 Box activated' : '🟢 Box activée',
    box_step_delivered: lang === 'EN' ? '🟢 Delivered' : '🟢 Livrée',
    box_step_stopped: lang === 'EN' ? '🔴 Stopped' : '🔴 Arrêtée',
    box_step_finished: lang === 'EN' ? '🔴 Finished' : '🔴 Terminée',
    box_step_refunded: lang === 'EN' ? 'Refunded' : 'Remboursée',
    box_step_creating: lang === 'EN' ? '🟠 Waiting for payment' : '🟠 En attente de paiement',
    box_step_renewing: lang === 'EN' ? '🟠 Renewing' : '🟠 En renouvellement',
    box_step_not_activated: lang === 'EN' ? '🔴 Not activated' : '🔴 Non activée',
    box_name: lang === 'EN' ? 'Name' : 'Nom',
    box_address: lang === 'EN' ? 'Address' : 'Adresse',
    box_city: lang === 'EN' ? 'City' : 'Ville',
    box_selection: lang === 'EN' ? 'My selection' : 'Ma sélection',
    box_actions: lang === 'EN' ? 'My actions' : 'Mes actions',
    box_wrong_record_button:
      lang === 'EN'
        ? 'I received a record I don’t want anymore'
        : 'J’ai reçu un disque que je souhaite retourner',
    box_incomplete_button: lang === 'EN' ? 'My box is incomplete' : 'Ma box est incomplète',
    box_damage_button: lang === 'EN' ? 'My box is damaged' : 'Ma box est endommagée',
    box_renew_header:
      lang === 'EN'
        ? 'You can renew this box by clicking the link below.'
        : 'Vous pouvez renouveler cette box en cliquant sur le lien ci-dessous.',
    box_renew_button: lang === 'EN' ? 'I wish to renew my box' : 'Je souhaite renouveler ma box',
    box_help_header:
      lang === 'EN'
        ? '📝 We’re sorry if you’re having issues with your Box. In order to help you, please contact us by clicking on “I wish to talk to the customer support” button below and type your request with the box ID reference. We will come back to you soon!'
        : '📝 Nous sommes navrés d’apprendre que vous avez des difficultés. Merci de cliquer sur “J’ai besoin d’échanger avec le service client” si dessous et effectuez votre demande en mentionnant votre ID de box. Nous reviendrons vers vous dans les plus brefs délais !'
  }

  return wording[key] || key
}

// Helper for localized dates from lang string
const getLocaleDateFromString: (date: any, lang: 'FR' | 'EN') => any = (date, lang = 'EN') => {
  return new Date(date).toLocaleDateString(lang === 'EN' ? 'en-US' : 'fr-FR', {
    day: 'numeric',
    month: '2-digit',
    year: 'numeric'
  })
}

const getMultiParagraph: (text: string, lang: 'EN' | 'FR') => { type: 'text'; text: string }[] = (
  text,
  lang = 'EN'
) => {
  const paragraphs = []

  if (Array.isArray(translate(text, lang))) {
    for (const paragraph of translate(text, lang)) {
      paragraphs.push({
        type: 'text',
        text: `*${paragraph}*`
      })
    }
  } else {
    paragraphs.push({
      type: 'text',
      text: `*${translate(text, lang)}*`
    })
  }

  return paragraphs
}

const generateBackMenu = ({ lang }) => [
  {
    type: 'spacer',
    size: 'm'
  },
  {
    type: 'divider'
  },
  {
    type: 'spacer',
    size: 'm'
  },
  {
    type: 'button',
    id: 'main-order-menu',
    label: translate('main_order_menu', lang),
    style: 'secondary',
    action: {
      type: 'submit'
    }
  }
]

const addBackMenu = ({ canvas, lang }) => {
  canvas.canvas.content.components.push(...generateBackMenu({ lang }))
  return canvas
}

// ! ORDER BOT

// Filters between sent and current orders
const getOrdersFromCart = (cart) => {
  const orders = []
  for (const item of cart) {
    orders.push(...item.shops)
  }

  // List sent orders
  const sentOrders = orders.filter((order) => order.step === 'sent')
  // Current orders
  const currentOrders = orders.filter((order) => order.step !== 'sent')

  return {
    orders,
    sentOrders,
    currentOrders
  }
}

// Generates order buttons to integrate into a canvas
const generateOrderButtons = (orders, lang) => {
  return orders.map((order) => {
    return {
      type: 'item',
      id: `order-card-${order.id}`,
      title: `${translate('order', lang)} N°${order.id}`,
      subtitle: `${order.total}${translate(order.currency)}`,
      tertiary_text: getLocaleDateFromString(order.created_at, lang),
      image: `${Env.get('STORAGE_URL')}/projects/${
        order.items[0].picture || order.items[0].project_id
      }/cover.jpg`,
      image_height: 48,
      image_width: 48,
      action: {
        type: 'submit'
      }
    }
  })
}

// Generates order buttons to integrate into a canvas
const generateDownloadButtons = (downloadItems, lang) => {
  return downloadItems.map((item) => {
    return {
      type: 'item',
      id: `redeem-download-${item.id}`,
      title: item.name,
      subtitle: item.artist_name,
      tertiary_text: translate('redeem_download_code', lang),
      image: `${Env.get('STORAGE_URL')}/projects/${item.picture || item.project_id}/cover.jpg`,
      image_height: 48,
      image_width: 48,
      action: {
        type: 'submit'
      }
    }
  })
}

// Generates a complete canvas component for order data display
const generateOrderCard: (order: any, lang: 'FR' | 'EN', single?: boolean) => any = async (
  order,
  lang,
  single = false
) => {
  // Get rid of mispelled cancel
  order.step = order.step === 'cancelled' ? 'canceled' : order.step

  const cardComponent: CardComponent = [
    {
      type: 'text',
      text: `*${getLocaleDateFromString(order.created_at, lang)} | ${translate('order', lang)} n°${
        order.id
      } | ${translate(`type_${order.type}`, lang)}*`,
      style: 'header'
    }
  ]

  // Display order as a block (1 item) or as a liste (2+ items)
  if (order.items.length === 1) {
    // Single block item
    cardComponent.push(
      {
        type: 'image',
        url: `${Env.get('STORAGE_URL')}/projects/${
          order.items[0].picture || order.items[0].project_id
        }/cover.jpg`,
        height: 300,
        width: 300
      },
      {
        type: 'text',
        text: `*${order.items[0].artist_name} - ${order.items[0].name}*`,
        style: 'paragraph'
      },
      {
        type: 'divider'
      }
    )
  } else {
    // Item list
    // Create a list for canvas kit
    const listItems: CardComponentList = {
      type: 'list',
      items: []
    }

    // Add items to the list (make sure id is a string since it's required by canvas kit)
    for (const item of order.items) {
      // Tertiary text changes if item has date_shipping or not
      const tertiaryText =
        (order.step === 'in_progress' || order.step === 'confirmed') &&
        order.items.length === 1 &&
        item.date_shipping
          ? `x${item.quantity} - ${item.price} ${item.currency}`
          : `🟢 ${translate('date_shipping', lang)} : ${getLocaleDateFromString(
              item.date_shipping,
              lang
            )}`

      listItems.items.push({
        type: 'item',
        id: `order-card-${item.id}`,
        title: item.name,
        subtitle: item.artist_name,
        tertiary_text: tertiaryText,
        image: `${Env.get('STORAGE_URL')}/projects/${item.picture || item.project_id}/cover.jpg`,
        image_width: 48,
        image_height: 48
      })
    }

    // Add the list to the card
    cardComponent.push(listItems)
  }

  // Display general order info (as a table)
  // Create the info table on its own (some fields are conditional)
  const infoTable: CardComponentDataTable = {
    type: 'data-table',
    items: []
  }

  // Add prices info
  infoTable.items.push(
    {
      type: 'field-value',
      field: translate('total', lang) as string,
      value: `${order.total}${translate(order.currency)}`
    },
    {
      type: 'field-value',
      field: translate('shipping', lang) as string,
      value: `${order.shipping}${translate(order.currency)}`
    }
  )

  // Add quantity info if it's a single item
  if (order.items.length === 1) {
    infoTable.items.push({
      type: 'field-value',
      field: translate('quantity', lang) as string,
      value: `x${order.items[0].quantity}`
    })
  }

  // Add refund info (if refunded)
  if (order.step === 'refund' || order.step === 'refunded') {
    infoTable.items.push({
      type: 'field-value',
      field: translate('refund_text', lang) as string,
      value: order.step === 'refund' || order.step === 'refunded' ? '✅' : '❌'
    })
  }

  // Add refund info (if cancelled)
  if (order.step === 'canceled' || order.step === 'cancelled') {
    infoTable.items.push({
      type: 'field-value',
      field: translate('cancelled', lang) as string,
      value: order.step === 'canceled' || order.step === 'cancelled' ? '✅' : '❌'
    })
  }

  // Add tracking info (if any)
  infoTable.items.push({
    type: 'field-value',
    field: translate('tracking_link_available', lang) as string,
    value: order.tracking_link || Utils.getTransporterLink(order) ? '✅' : '❌'
  })

  // Info shipment origin
  infoTable.items.push({
    type: 'field-value',
    field: translate('shipment_origin', lang) as string,
    value: translate(`country_${Utils.getOriginFromTransporter(order.transporter)}`, lang) as string
  })

  // Push the info table to the card
  cardComponent.push(infoTable)

  // Display order status (if not launched, never used)
  if (order.step !== 'launched') {
    // If only one item and date_shipping is set on in_production, display shipping date
    if (
      (order.step === 'in_progress' || order.step === 'confirmed') &&
      order.items.length === 1 &&
      order.items[0].date_shipping
    ) {
      cardComponent.push({
        type: 'list',
        items: [
          {
            type: 'item',
            id: 'preprod',
            title: `🟢 ${translate('date_shipping', lang)} : ${getLocaleDateFromString(
              order.items[0].date_shipping,
              lang
            )}`,
            subtitle: translate('date_shipping_description', lang)
          }
        ]
      })
    } else {
      // Create paragraphs if array, single text if string.
      // If order step is confirmed, display confirmed_[vod|shop]
      const stepMessage = getMultiParagraph(
        order.step === 'confirmed' ? `confirmed_${order.type}` : order.step,
        lang
      )

      cardComponent.push(
        {
          type: 'spacer',
          size: 'm'
        },
        {
          type: 'text',
          text: translate('order_step', lang),
          bottom_margin: 'none'
        },
        ...stepMessage
      )

      // If order step is check_address, display button to re-send check_address notification
      if (order.step === 'check_address') {
        cardComponent.push({
          type: 'button',
          id: 'resend-check-address',
          label: translate('resend_check_address', lang) as string,
          style: 'secondary',
          action: {
            type: 'submit'
          }
        })
      }
    }
  }

  // If in production, fetch production data to get any estimated date of progress.
  if (order.step === 'in_production') {
    // Get production dates from projectId
    const {
      date_preprod: datePreProd,
      date_prod: dateProd,
      date_postprod: datePostProd,
      date_shipping: dateShipping
    } = await Production.findByProjectId({ projectId: order.items[0].project_id, userId: 1 })

    // Prepare date list
    const datesProd: CardComponentList = {
      type: 'list',
      items: []
    }

    // Conditionnally add dates to the list
    if (datePreProd) {
      datesProd.items.push({
        type: 'item',
        id: 'preprod',
        title: `🟢 ${getLocaleDateFromString(datePreProd, lang)} - ${translate('preprod', lang)}`,
        subtitle: translate('preprod_description', lang)
      })
    }

    if (dateProd) {
      datesProd.items.push({
        type: 'item',
        id: 'prod',
        title: `🟢 ${getLocaleDateFromString(dateProd, lang)} - ${translate('prod', lang)}`,
        subtitle: translate('prod_description', lang)
      })
    }

    if (datePostProd) {
      datesProd.items.push({
        type: 'item',
        id: 'postprod',
        title: `🟢${getLocaleDateFromString(datePostProd, lang)} - ${translate('postprod', lang)}`,
        subtitle: translate('postprod_description', lang)
      })
    }

    if (dateShipping) {
      datesProd.items.push({
        type: 'item',
        id: 'shipping',
        title: `🟢 ${getLocaleDateFromString(dateShipping, lang)} - ${translate(
          'prod_shipping',
          lang
        )}`,
        subtitle: translate(
          'prod_shipping_description',
          lang,
          getLocaleDateFromString(dateShipping, lang)
        )
      })
    }

    // Push the dates to the card
    cardComponent.push(datesProd)
  }

  // Display tracking information (if any)
  if (order.tracking_number) {
    const trackingLink = order.tracking_link || Utils.getTransporterLink(order)

    // If trackingLink ends up an empty string, create an appropriate response (to avoid confusion for the user and an Intercom app crash)
    if (!trackingLink) {
      cardComponent.push({
        type: 'text',
        text: translate('no_tracking_link', lang),
        bottom_margin: 'none'
      })
    } else {
      cardComponent.push(
        {
          type: 'text',
          text: translate('got_tracking_link', lang),
          style: 'paragraph'
        },
        {
          type: 'button',
          id: 'tracking-url-action',
          label: translate('see_tracking_link', lang) as string,
          style: 'primary',
          action: {
            type: 'url',
            url: trackingLink || 'https://www.google.fr/'
          }
        }
      )
    }
  }

  // Display other orders buttons (if any)
  if (!single) {
    cardComponent.push(
      {
        type: 'spacer',
        size: 'm'
      },
      {
        type: 'divider'
      },
      {
        type: 'spacer',
        size: 'm'
      },
      {
        type: 'button',
        id: 'see-other-orders',
        label: translate('see_other_orders', lang) as string,
        style: 'secondary',
        action: {
          type: 'submit'
        }
      }
    )
  }

  return cardComponent
}

const generateDownloadbleItemCard = async ({ item, userId, lang }) => {
  if (!item) {
    return [
      {
        type: 'text',
        text: translate('no_downloadables', lang),
        style: 'header'
      }
    ]
  }

  const { codeIsUsed } = await Project.checkDownloadCode({ projectId: item.project_id, userId })

  if (codeIsUsed) {
    return [
      {
        type: 'text',
        text: translate('code_download_used', lang),
        style: 'header'
      }
    ]
  }

  const code = await Project.generateDownload({ project_id: item.project_id })

  return [
    {
      type: 'image',
      url: `${Env.get('STORAGE_URL')}/projects/${item.picture || item.project_id}/cover.jpg`,
      height: 300,
      width: 300
    },
    {
      type: 'text',
      text: `*${item.artist_name} - ${item.name}*`,
      style: 'paragraph'
    },
    {
      type: 'divider'
    },
    {
      type: 'text',
      text: translate('code_download_helper', lang),
      style: 'paragraph'
    },
    {
      type: 'button',
      id: 'code',
      label: translate('code_download_link', lang),
      action: {
        type: 'url',
        url: `https://www.diggersfactory.com/download?code=${code}`
      }
    }
  ]
}

const replyWithCheckAddressCard = async ({ botData, lang }) => {
  return {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('check_address_details', lang),
            style: 'paragraph'
          },
          {
            type: 'button',
            id: 'resend-check-address',
            label: translate('check_address_link', lang),
            action: {
              type: 'url',
              url: 'https://www.diggersfactory.com/fr/my-account/orders'
            }
          },
          {
            type: 'spacer',
            size: 'm'
          },
          {
            type: 'button',
            id: 'see-other-orders',
            label: translate('back_to_orders', lang),
            style: 'secondary',
            action: {
              type: 'submit'
            }
          }
        ]
      },
      stored_data: { lang: lang, failCount: 0, botData: botData }
    }
  }
}

// Generates and return a canvas component with error notification for the user
const replyWithErrorCard: ({ lang }: { lang: 'FR' | 'EN' }) => any = ({ lang = 'EN' }) => {
  return {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: `${translate('error', lang)}`,
            style: 'header'
          },
          {
            type: 'text',
            text: translate('error_message', lang),
            style: 'paragraph'
          }
        ]
      }
    },
    event: {
      type: 'completed'
    }
  }
}

const replyWithOrderChoice = async ({ lang, botData }) => {
  return {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('multiple_orders', lang),
            style: 'header'
          },
          {
            type: 'button',
            id: 'all-orders',
            label: translate('all_orders', lang),
            style: 'secondary',
            action: {
              type: 'submit'
            }
          },
          {
            type: 'button',
            id: 'sent-orders',
            label: translate('sent_orders', lang),
            style: 'secondary',
            action: {
              type: 'submit'
            }
          },
          {
            type: 'button',
            id: 'current-orders',
            label: translate('current_orders', lang),
            style: 'secondary',
            action: {
              type: 'submit'
            }
          }
        ]
      },
      stored_data: { lang: lang, botData: botData }
    }
  }
}

// Displays a list of orders regarding its type (sent or current). Distinguishes between lists of one and many.
const handleMultipleOrders = async ({ botData, catOrders, lang }) => {
  // Single typed order - skip choice card and display order card
  if (catOrders.length === 1) {
    return await replyWithOrderCard({ orderShopId: catOrders[0].id, botData, lang })
  }

  // Multiple typed orders
  const ordersButtons = generateOrderButtons(catOrders, lang)

  const components = [
    {
      type: 'text',
      text: translate('many_orders', lang),
      style: 'header'
    },
    {
      type: 'list',
      items: ordersButtons
    }
  ]

  return {
    canvas: {
      content: {
        components
      },
      stored_data: { lang: lang, botData: botData }
    }
  }
}

// ! ORDERS
const replyWithOrderInit = async ({ lang, botData }) => {
  return {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('order_init', lang),
            style: 'header'
          },
          {
            type: 'spacer',
            size: 'm'
          },
          {
            type: 'button',
            id: 'all-orders',
            label: translate('order_choice', lang),
            action: {
              type: 'submit'
            }
          },
          {
            type: 'button',
            id: 'download-code',
            label: translate('download_choice', lang),
            action: {
              type: 'submit'
            }
          },
          {
            type: 'button',
            id: 'all-boxes',
            label: translate('box_choice', lang),
            action: {
              type: 'submit'
            }
          }
        ]
      },
      stored_data: { lang: lang, botData: botData }
    }
  }
}

// Reply with a canvas component with a list of user's orders.
const replyWithOrderList = async ({ botData, currentAction, lang }) => {
  // If more than 1 order, reorder data
  const { orders: allOrders, sentOrders, currentOrders } = getOrdersFromCart(botData.orders)

  // * No orders
  // If user has no orders, return
  if (allOrders.length === 0) {
    const components = [
      {
        type: 'text',
        text: translate('no_orders', lang),
        style: 'paragraph'
      }
    ]

    const canvas = {
      canvas: {
        content: {
          components
        },
        stored_data: { lang: lang, botData: botData }
      },
      event: { type: 'completed' }
    }
    return addBackMenu({ canvas, lang })
  }

  // * Exactly 1 order overall (skip the choice card)
  if (allOrders.length === 1) {
    const components = await generateOrderCard(allOrders[0], lang, true)

    return {
      canvas: {
        content: {
          components
        },
        stored_data: { lang: lang, botData: botData }
      }
    }
  }

  // * If more than 1 order and 4 or less, display them all without distinction || user chooses to see all orders
  if (currentAction === 'all-orders' || allOrders.length <= 4) {
    const canvas = await handleMultipleOrders({ botData, catOrders: allOrders, lang })
    return addBackMenu({ canvas, lang })
  }

  // ONLY SENT ORDERS
  if (currentAction === 'sent-orders' || (sentOrders.length > 0 && currentOrders.length === 0)) {
    const canvas = await handleMultipleOrders({ botData, catOrders: sentOrders, lang })
    return addBackMenu({ canvas, lang })
  }

  // ONLY CURRENT ORDERS
  if (currentAction === 'current-orders' || (currentOrders.length > 0 && sentOrders.length === 0)) {
    const canvas = await handleMultipleOrders({ botData, catOrders: currentOrders, lang })
    return addBackMenu({ canvas, lang })
  }

  // ELSE, Choice between all, sent and current orders
  const canvas = await replyWithOrderChoice({ lang, botData })
  return addBackMenu({ canvas, lang })
}

const replyWithOrderCard = async ({ orderShopId, botData, lang }) => {
  // Find the right order_shop
  let orderShop
  for (const order of botData.orders) {
    for (const shop of order.shops) {
      if (shop.id === orderShopId) {
        orderShop = shop
        break
      }
    }
  }

  // Generate a canvas card for the order
  const orderCard = await generateOrderCard(orderShop, lang)

  // Display it to the chat
  return {
    canvas: {
      content: {
        components: orderCard
      },
      stored_data: { lang: lang, botData: botData }
    }
  }
}

const replyWithDownloadCard = async ({ itemId, botData, lang }) => {
  // Find the right order_shop
  let downloadbleItem
  for (const order of botData.orders) {
    for (const shop of order.shops) {
      for (const item of shop.items) {
        if (item.id === +itemId) {
          downloadbleItem = item
          break
        }
      }
    }
  }

  const components = await generateDownloadbleItemCard({
    item: downloadbleItem,
    lang,
    userId: botData.diggersUserId
  })

  // Display it to the chat
  const canvas = {
    canvas: {
      content: {
        components
      },
      stored_data: { lang: lang, botData: botData }
    }
  }
  return addBackMenu({ canvas, lang })
}

const replyWithDownloadList = async ({ lang, botData }) => {
  const downloadableItems: any[] = []
  for (const order of botData.orders) {
    for (const shop of order.shops) {
      for (const item of shop.items) {
        if (item.download) {
          downloadableItems.push(item)
        }
      }
    }
  }

  // If no downloadable items, return
  if (downloadableItems.length === 0) {
    const canvas = {
      canvas: {
        content: {
          components: [
            {
              type: 'text',
              text: translate('no_downloadables', lang),
              style: 'header'
            }
          ]
        },
        stored_data: { lang: lang, botData: botData }
      }
    }
    return addBackMenu({ canvas, lang })
  }

  const downloadButtons = generateDownloadButtons(downloadableItems, lang)

  const canvas = {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('download_code_header', lang),
            style: 'header'
          },
          {
            type: 'list',
            items: downloadButtons
          }
        ]
      },
      stored_data: { lang: lang, botData: botData }
    }
  }

  return addBackMenu({ canvas, lang })
}

// ! ACCOUNT BOT
const replyWithAccountInit = async (request, response) => {
  // Launch app loop
  // Conversation ID
  const conversationId = request.body.context.conversation_id

  // Get language from app config (defaults to EN)
  const lang = request.body.card_creation_options.language || 'EN'

  // If no conversation, it means that we're trying to setup the bot in the operator. Return the appropriate card
  if (!conversationId) {
    return response.json({
      canvas: {
        content: {
          components: [
            {
              type: 'text',
              text: 'Diggers Account Bot 🤖👩‍💻',
              style: 'header'
            },
            {
              type: 'text',
              text: 'This is a bot that helps visitors (not logged) to manage their account info. It will automatically send them through a logical flow to find if an email is linked to a Diggers account.',
              style: 'paragraph'
            },
            {
              type: 'text',
              text: `Language selected: *${lang === 'EN' ? 'English 🗽' : 'French 🥐'}*`
            },
            {
              type: 'text',
              text: '🤔 If any issue occurs, please contact *@Robin.*'
            }
          ]
        }
      }
    })
  }

  // Else, display email input
  return response.json({
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('account_header', lang),
            style: 'header'
          },
          {
            type: 'text',
            text: translate('enter_email', lang),
            style: 'paragraph'
          },
          {
            type: 'input',
            id: 'email',
            placeholder: 'john@mail.com',
            action: {
              type: 'submit'
            }
          }
        ]
      },
      stored_data: { lang, failCount: 0 }
    }
  })
}

const replyWithForgotConfirmation = async (email, response, lang) => {
  // Launch email reset
  await Auth.forgotPassword({ email })

  // Return info to Intercom
  return response.json({
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('forgot_password_header', lang),
            style: 'header'
          },
          {
            type: 'text',
            text: translate('forgot_password_helper', lang),
            style: 'paragraph'
          }
        ]
      },
      stored_data: { lang: lang || 'EN' }
    }
  })
}

const replyWithInputFlow = async ({ email, response, lang, failCount, currentAction, orders }) => {
  // If input is not an email, display error
  if (!Utils.isEmail(email)) {
    return response.json({
      canvas: {
        content: {
          components: [
            {
              type: 'text',
              text: translate('email_regex', lang),
              style: 'paragraph'
            },
            {
              type: 'input',
              id: currentAction,
              placeholder: 'john@mail.com',
              action: {
                type: 'submit'
              }
            }
          ]
        },
        stored_data: { lang: lang || 'EN', orders: orders }
      }
    })
  }

  // If fail count > 3, don't let the user endlessly ping the DB. Reroute him to CS
  if (failCount > 3) {
    return response.json({
      canvas: {
        content: {
          components: [
            {
              type: 'text',
              text: translate('error_account_fail', lang),
              style: 'header'
            },
            {
              type: 'text',
              text: translate('error_account_fail_message', lang),
              style: 'paragraph'
            }
          ],
          stored_data: { lang: lang || 'EN', failCount: failCount, orders: orders }
        }
      }
    })
  }

  const userExists = await User.existsByEmail(email)

  // If email is not an account, return an error/retry
  if (!userExists) {
    // Increments fail count
    failCount++
    // Else, let him retype his email
    return response.json({
      canvas: {
        content: {
          components: [
            {
              type: 'text',
              text: translate('email_not_found', lang),
              style: 'header'
            },
            {
              type: 'text',
              text: translate('email_try_again', lang),
              style: 'paragraph'
            },
            {
              type: 'input',
              id: 'email',
              placeholder: 'john@mail.com',
              action: {
                type: 'submit'
              }
            }
          ]
        },
        stored_data: { lang: lang || 'EN', failCount: failCount }
      }
    })
  }

  // If email is valid, tell the user that the email is linked to a Diggers account and he must connect to proceed (link to url login ?)
  return response.json({
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('email_found', lang),
            style: 'header'
          },
          {
            type: 'text',
            text: translate('email_found_helper', lang),
            style: 'paragraph'
          },
          { type: 'spacer', size: 'm' },
          { type: 'divider' },
          { type: 'spacer', size: 'm' },
          {
            type: 'text',
            text: translate('forgot_password', lang),
            style: 'paragraph'
          },
          {
            type: 'button',
            id: 'reset-password',
            label: translate('forgot_password_link', lang),
            action: {
              type: 'submit'
            }
          }
        ]
      },
      stored_data: { email, lang: lang || 'EN' }
    }
  })
}

//! BOXES
const generateBoxListItems = ({ boxes, lang }) => {
  return boxes.map((box) => ({
    type: 'item',
    id: `box-card-${box.id}`,
    title: `Box ${translate(`box_type_${box.type}`, lang)} - ${translate(
      `box_period_${box.periodicity}`,
      lang
    )}`,
    subtitle: `Box N°${box.id}`,
    tertiary_text: translate(`box_step_${box.step}`, lang),
    image: 'https://storage.diggersfactory.com/assets/images/icons/streamline/gift-box-1.svg',
    image_height: 36,
    image_width: 36,
    action: {
      type: 'submit'
    }
  }))
}

const generateBoxCard = ({ box, lang, genres }) => {
  const recordItems = []
  for (const record of box.records) {
    for (let index = 1; index <= 6; index++) {
      if (record[`project${index}`]) {
        recordItems.push({
          type: 'item',
          id: `record-card-${record[`project${index}`]}`,
          title: record[`p${index}_name`],
          subtitle: record[`p${index}_artist`],
          tertiary_text: getLocaleDateFromString(record.date, lang),
          image: `${Env.get('STORAGE_URL')}/projects/${
            record[`p${index}_picture`] || record[`p${index}`]
          }/cover.jpg`,
          image_height: 48,
          image_width: 48
        })
      }
    }
  }

  return [
    {
      type: 'text',
      text: `Box ${translate(`box_type_${box.type}`, lang)} - ${translate(
        `box_period_${box.periodicity}`,
        lang
      )}`,
      style: 'header'
    },
    {
      type: 'data-table',
      items: [
        {
          type: 'field-value',
          field: translate('box_status', lang),
          value: translate(`box_step_${box.step}`, lang)
        },
        {
          type: 'field-value',
          field: 'Styles',
          value: genres
            .filter((style) => box.styles.includes(style.id))
            .map((style) => style.name)
            .join(', ')
        },
        {
          type: 'field-value',
          field: translate('box_name', lang),
          value: `${box.customer.firstname} ${box.customer.lastname}`
        },
        {
          type: 'field-value',
          field: translate('box_address', lang),
          value: `${box.customer.address}`
        },
        {
          type: 'field-value',
          field: translate('box_city', lang),
          value: `${box.customer.city}`
        }
      ]
    },

    {
      type: 'spacer',
      size: 'm'
    },
    {
      type: 'divider'
    },
    {
      type: 'spacer',
      size: 'm'
    },
    {
      type: 'text',
      text: translate('box_selection', lang),
      style: 'header'
    },
    {
      type: 'list',
      items: recordItems
    },

    {
      type: 'spacer',
      size: 'm'
    },
    {
      type: 'text',
      text: translate('box_actions', lang),
      style: 'header'
    },
    {
      type: 'button',
      id: 'box-help-wrong-record',
      label: translate('box_wrong_record_button', lang),
      style: 'secondary',
      action: {
        type: 'submit'
      }
    },
    {
      type: 'button',
      id: 'box-help-incomplete',
      label: translate('box_incomplete_button', lang),
      style: 'secondary',
      action: {
        type: 'submit'
      }
    },
    {
      type: 'button',
      id: 'box-help-damage',
      label: translate('box_damage_button', lang),
      style: 'secondary',
      action: {
        type: 'submit'
      }
    },
    {
      type: 'button',
      id: 'box-renew',
      label: translate('box_renew_button', lang),
      style: 'secondary',
      action: {
        type: 'submit'
      }
    }
  ]
}

const replyWithBoxList = async ({ lang, botData }) => {
  // If no boxes, inform the user
  if (!botData.boxes.length) {
    const canvas = {
      canvas: {
        content: {
          components: [
            {
              type: 'text',
              text: translate('no_boxes', lang),
              style: 'header'
            }
          ]
        },
        stored_data: { lang, botData }
      }
    }

    return addBackMenu({ canvas, lang })
  }

  // If there are boxes, generate the list
  const boxListItems = generateBoxListItems({ lang, boxes: botData.boxes })

  const canvas = {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('box_header', lang),
            style: 'header'
          },
          {
            type: 'spacer',
            size: 'm'
          },
          {
            type: 'list',
            items: boxListItems
          }
        ]
      },
      stored_data: { lang, botData }
    }
  }

  return addBackMenu({ canvas, lang })
}

const replyWithBoxCard = async ({ boxId, lang, botData }) => {
  const boxComponent = generateBoxCard({
    box: botData.boxes.find((box) => box.id === boxId),
    lang,
    genres: botData.genres
  })

  botData.boxId = boxId

  const canvas = {
    canvas: {
      content: {
        components: boxComponent
      },
      stored_data: { lang, botData }
    }
  }

  return addBackMenu({ canvas, lang })
}

const replyWithBoxHelp = async ({ lang, botData, boxId }) => {
  const canvas = {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('box_help_header', lang)
          },
          {
            type: 'text',
            text: `Box ID: ${boxId}`,
            style: 'header'
          }
        ]
      },
      stored_data: { lang, botData }
    }
  }

  return addBackMenu({ canvas, lang })
}

const replyWithBoxRenew = async ({ lang, botData }) => {
  const canvas = {
    canvas: {
      content: {
        components: [
          {
            type: 'text',
            text: translate('box_renew_header', lang)
          },
          {
            type: 'button',
            id: 'box-renew',
            label: translate('box_renew_button', lang),
            action: {
              type: 'url',
              url: 'https://www.diggersfactory.com/fr/my-account/box'
            }
          }
        ]
      },
      stored_data: { lang, botData }
    }
  }

  return addBackMenu({ canvas, lang })
}

export default {
  generateBackMenu,
  replyWithOrderList,
  replyWithOrderCard,
  replyWithAccountInit,
  replyWithForgotConfirmation,
  replyWithInputFlow,
  replyWithCheckAddressCard,
  replyWithErrorCard,
  replyWithOrderInit,
  replyWithDownloadList,
  replyWithDownloadCard,
  replyWithBoxList,
  replyWithBoxCard,
  replyWithBoxHelp,
  replyWithBoxRenew
}
