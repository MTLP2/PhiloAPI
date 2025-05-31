import Route from '@ioc:Adonis/Core/Route'

Route.get('/', 'AppController.index')
Route.post('/ia', 'IAController.test')
Route.post('/story', 'StoryController.save')
Route.post('/newsletter', 'NewsletterController.RegisterNewsletter')
