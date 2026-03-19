import React, { useState, useEffect } from 'react';
import './ScreenSourceSelector.css';

interface DesktopSource {
    id: string;
    name: string;
    thumbnail: string;
    display_id: string;
    appIcon: string | null;
}

interface ScreenSourceSelectorProps {
    onSelect: (sourceId: string, options: { withAudio: boolean, resolution: string, frameRate: string }) => void;
    onClose: () => void;
}

const ScreenSourceSelector: React.FC<ScreenSourceSelectorProps> = ({ onSelect, onClose }) => {
    const [sources, setSources] = useState<DesktopSource[]>([]);
    const [selectedTab, setSelectedTab] = useState<'screen' | 'window'>('screen');
    const [loading, setLoading] = useState(true);
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [resolution, setResolution] = useState('720');
    const [frameRate, setFrameRate] = useState('30');

    useEffect(() => {
        const fetchSources = async () => {
            const electron = (window as any).electron;
            if (!electron || !electron.getDesktopSources) {
                console.warn('Electron desktopCapturer is not available yet.');
                return;
            }

            setLoading(true);
            try {
                const types = selectedTab === 'screen' ? ['screen'] : ['window'];
                const results = await electron.getDesktopSources({
                    types,
                    thumbnailSize: { width: 300, height: 170 }
                });
                setSources(results);
            } catch (err) {
                console.error('Failed to get sources:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchSources();
        const interval = setInterval(fetchSources, 3000);
        return () => clearInterval(interval);
    }, [selectedTab]);

    const handleSelect = () => {
        if (selectedSourceId) {
            // Screen sharing on Windows: 
            // Entire screen usually carries system audio.
            // Individual windows usually don't carry audio unless it's a browser tab (not common for Electron yet).
            // However, we will pass true for withAudio and handle it in the provider.
            onSelect(selectedSourceId, { withAudio: true, resolution, frameRate });
        }
    };

    return (
        <div className="screen-source-selector-overlay" onClick={onClose}>
            <div className="screen-source-selector-modal" onClick={e => e.stopPropagation()}>
                <div className="screen-source-selector-header">
                    <h2>Выберите, что транслировать</h2>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>

                <div className="screen-source-tabs">
                    <button
                        className={`tab-button ${selectedTab === 'screen' ? 'active' : ''}`}
                        onClick={() => setSelectedTab('screen')}
                    >
                        Экраны
                    </button>
                    <button
                        className={`tab-button ${selectedTab === 'window' ? 'active' : ''}`}
                        onClick={() => setSelectedTab('window')}
                    >
                        Приложения
                    </button>
                </div>

                <div className="screen-quality-settings">
                    <div className="quality-section">
                        <div className="quality-label">Разрешение</div>
                        <div className="quality-options">
                            {['480', '720', '1080', '1440', '2160'].map(res => (
                                <button
                                    key={res}
                                    className={`quality-option ${resolution === res ? 'active' : ''}`}
                                    onClick={() => setResolution(res)}
                                >
                                    {res === '2160' ? '4K' : res === '1440' ? '2K' : res + 'p'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="quality-section">
                        <div className="quality-label">Частота кадров</div>
                        <div className="quality-options">
                            {['15', '30', '60', '120'].map(fps => (
                                <button
                                    key={fps}
                                    className={`quality-option ${frameRate === fps ? 'active' : ''}`}
                                    onClick={() => setFrameRate(fps)}
                                >
                                    {fps} FPS
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="screen-source-selector-content">
                    {loading && sources.length === 0 ? (
                        <div className="screen-source-selector-loading">
                            <div className="loading-spinner"></div>
                            <p>Загрузка источников...</p>
                        </div>
                    ) : sources.length === 0 ? (
                        <div className="no-sources">
                            <p>Источники не найдены</p>
                        </div>
                    ) : (
                        <div className="sources-grid">
                            {sources.map(source => (
                                <div
                                    key={source.id}
                                    className={`source-item ${selectedSourceId === source.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedSourceId(source.id)}
                                    onDoubleClick={() => {
                                        setSelectedSourceId(source.id);
                                        onSelect(source.id, { withAudio: true, resolution, frameRate });
                                    }}
                                >
                                    <div className="source-thumbnail-container">
                                        <img src={source.thumbnail} alt={source.name} className="source-thumbnail" />
                                        <div className="source-thumbnail-overlay"></div>
                                    </div>
                                    <div className="source-info">
                                        {source.appIcon ? (
                                            <div className="source-app-icon">
                                                <img src={source.appIcon} alt="" />
                                            </div>
                                        ) : (
                                            <div className="source-app-icon placeholder"></div>
                                        )}
                                        <span className="source-name">{source.name}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="screen-source-selector-footer">
                    <button className="cancel-button" onClick={onClose}>Отмена</button>
                    <button
                        className="select-button"
                        disabled={!selectedSourceId}
                        onClick={handleSelect}
                    >
                        Прямой эфир
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreenSourceSelector;
