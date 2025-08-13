/*=====================================================================
ShaderEditorDialog.h
-------------------
Copyright Glare Technologies Limited 2019 -
=====================================================================*/
#pragma once


#include "ui_ShaderEditorDialog.h"
#include "ISLSyntaxHighlighter.h"


class QTimer;
class QGridLayout;


/*=====================================================================
ShaderEditorDialog
-------------------

=====================================================================*/
class ShaderEditorDialog : public QMainWindow, public Ui_ShaderEditorDialog
{
	Q_OBJECT
public:
	ShaderEditorDialog(QWidget* parent, std::string base_dir_path);
	virtual ~ShaderEditorDialog();

	void initialise(const std::string& shader);
	void update(const std::string& shader);

	QString getShaderText();

signals:;
	void shaderChanged();

private:
	virtual void keyPressEvent(QKeyEvent* event);
	virtual void closeEvent(QCloseEvent* event);

	QTimer* emit_shader_changed_timer;
	QTimer* syntax_highlight_timer;
	ISLSyntaxHighlighter* highlighter;

private slots:;
	void on_shaderEdit_textChanged();
	void emitShaderChangedTimerFired();
	void buildCodeAndShowResults();

private:
	std::string base_dir_path;
};
