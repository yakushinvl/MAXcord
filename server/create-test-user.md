# Создание тестового пользователя

Сервер работает правильно! Ответ `{"message":"Invalid credentials"}` означает, что пользователя с такими данными не существует.

## Вариант 1: Создание пользователя через API

```bash
curl -X POST https://serverzvon.duckdns.org/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "test123"
  }'
```

Если регистрация успешна, вы получите ответ с токеном и данными пользователя.

## Вариант 2: Создание пользователя через MongoDB

Подключитесь к MongoDB и создайте пользователя вручную:

```bash
# Подключение к MongoDB
mongo

# Или если используется MongoDB 6+
mongosh
```

Затем выполните:

```javascript
use zvon

// Создание пользователя (пароль будет захеширован)
// ВАЖНО: В реальном приложении пароль должен быть захеширован через bcrypt
// Но для теста можно использовать существующую функцию

// Сначала нужно захешировать пароль через Node.js
// Или использовать готовый скрипт
```

## Вариант 3: Создание через Node.js скрипт

Создайте файл `create-user.js` в директории сервера:

```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function createUser() {
  try {
    // Подключение к MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zvon');
    console.log('Connected to MongoDB');

    // Данные пользователя
    const username = 'testuser';
    const email = 'test@example.com';
    const password = 'test123';

    // Проверка существования пользователя
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      console.log('User already exists:', existingUser.email);
      process.exit(0);
    }

    // Хеширование пароля
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Создание пользователя
    const user = new User({
      username,
      email,
      password: hashedPassword,
      status: 'offline'
    });

    await user.save();
    console.log('User created successfully:', {
      id: user._id,
      username: user.username,
      email: user.email
    });

    process.exit(0);
  } catch (error) {
    console.error('Error creating user:', error);
    process.exit(1);
  }
}

createUser();
```

Запустите скрипт:

```bash
cd /var/www/zvon/server
node create-user.js
```

## Вариант 4: Использование существующего пользователя

Если у вас уже есть пользователь, используйте его credentials для входа.

## Проверка после создания

После создания пользователя попробуйте войти:

```bash
curl -X POST https://serverzvon.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

Должен вернуться ответ с токеном и данными пользователя:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "username": "testuser",
    "email": "test@example.com",
    "avatar": null,
    "status": "online"
  }
}
```

