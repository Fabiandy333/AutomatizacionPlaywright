

await page.getByRole('button', { name: 'Ok' }).click();
await page.getByRole('textbox', { name: 'Usuario' }).fill('3154599494');
await page.getByRole('textbox', { name: 'Contraseña' }).fill("1118310140");
await page.getByRole('button', { name: 'Entrar' }).click(); 