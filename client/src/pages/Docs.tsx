import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Docs.css';

const Docs: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'general' | 'bot-api'>('general');

    return (
        <div className="docs-container">
            <nav className="docs-nav">
                <div className="nav-logo" onClick={() => navigate('/')}>
                    <img src="/logo-trans_256x256.png" alt="MAXCORD" />
                    <span>MAXCORD Docs</span>
                </div>
                <button className="btn-back" onClick={() => navigate('/')}>На главную</button>
            </nav>

            <div className="docs-layout">
                <aside className="docs-sidebar">
                    <div
                        className={`sidebar-item ${activeTab === 'general' ? 'active' : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        Основные возможности
                    </div>
                </aside>

                <main className="docs-main">
                        <div className="docs-content">
                            <h1>Документация MAXCORD</h1>
                            <p className="lead">MAXCORD — это современная платформа для общения, стриминга и совместного проведения времени.</p>

                            <section>
                                <h2>🚀 Начало работы</h2>
                                <p>Чтобы начать пользоваться MAXCORD, зарегистрируйтесь или войдите в свою учетную запись. Вы можете использовать веб-версию или скачать клиент для Windows.</p>
                                <ul>
                                    <li><strong>Серверы:</strong> Основное место для общения. Вы можете создать свой сервер или присоединиться к существующему по ссылке-приглашению.</li>
                                    <li><strong>Каналы:</strong> На каждом сервере есть Текстовые и Голосовые каналы.</li>
                                    <li><strong>Роли:</strong> Настраивайте права доступа и выделяйте пользователей с помощью гибкой системы ролей.</li>
                                </ul>
                            </section>

                            <section>
                                <h2>🎧 Голосовое общение и Стриминг</h2>
                                <p>MAXCORD поддерживает высококачественный звук и передачу видео в 4K.</p>
                                <ul>
                                    <li><strong>Шумоподавление:</strong> Встроено по умолчанию для кристальной чистоты звука.</li>
                                    <li><strong>Демонстрация экрана:</strong> Стримить можно как весь экран, так и отдельное окно приложения.</li>
                                    <li><strong>Музыкальные боты:</strong> Вы можете добавлять ботов для прослушивания музыки всей компанией.</li>
                                </ul>
                            </section>

                            <section>
                                <h2>🛡️ Приватность</h2>
                                <p>Мы не продаем ваши данные. Общение на серверах происходит через защищенные LiveKit-узлы.</p>
                            </section>
                        </div>
                </main>
            </div>
        </div>
    );
};

export default Docs;
