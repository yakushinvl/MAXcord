import React from 'react';
import { useNavigate } from 'react-router-dom';

const Policy: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0b0d12',
            color: '#fff',
            padding: '80px 40px',
            fontFamily: 'Inter, sans-serif',
            maxWidth: '1200px',
            margin: '0 auto'
        }}>
            <button onClick={() => navigate('/')} style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '40px'
            }}>Назад на главную</button>

            <h1>Условия использования и Приватность</h1>
            <p className="lead" style={{ fontSize: '18px', color: '#94a3b8', marginBottom: '40px' }}>
                Мы ценим ваше доверие и стремимся сделать maxcord самым безопасным местом для общения.
            </p>

            <section style={{ marginBottom: '40px' }}>
                <h2>1. Общие положения</h2>
                <p>maxcord — это сервис для обмена сообщениями и мультимедиа. Используя сервис, вы соглашаетесь не загружать вредоносный контент и уважать других пользователей.</p>
            </section>

            <section style={{ marginBottom: '40px' }}>
                <h2>2. Приватность и Данные</h2>
                <p>Мы не собираем персональные данные для продажи рекламодателям. Ваши сообщения хранятся в зашифрованном виде. Голосовой трафик проходит через защищенные LiveKit-узлы.</p>
            </section>
        </div>
    );
};

export default Policy;
