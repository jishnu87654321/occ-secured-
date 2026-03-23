const fs = require('fs');

const files = [
  'src/routes/admin.ts',
  'src/routes/clubs.ts',
  'src/routes/posts.ts',
  'src/routes/users.ts'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/(?<!String\()req\.params\.([a-zA-Z0-9_]+)/g, (match, p1) => `String(req.params.${p1})`);
  content = content.replace(/(?<!String\()req\.query\.([a-zA-Z0-9_]+)/g, (match, p1) => `String(req.query.${p1})`);
  fs.writeFileSync(f, content);
});

let admin = fs.readFileSync('src/routes/admin.ts', 'utf8');
admin = admin.replace(
  'const allowedData: Record<string, unknown> = {};',
  'const allowedData: any = {};'
);
admin = admin.replace(
  '.map(serializeUser)',
  '.map(u => serializeUser(u))'
);
fs.writeFileSync('src/routes/admin.ts', admin);

let users = fs.readFileSync('src/routes/users.ts', 'utf8');
users = users.replace(
  'req.user = user;',
  'req.user = user as any;'
);
users = users.replace(
  'return successResponse(res, "Profile fetched successfully", { user: serializeUser(user) });',
  'return successResponse(res, "Profile fetched successfully", { user: serializeUser(user as any) });'
);
fs.writeFileSync('src/routes/users.ts', users);

console.log('Patched correctly!');
