/*=====================================================================
GestureUI.cpp
-------------
Copyright Glare Technologies Limited 2021 -
=====================================================================*/
#include "GestureUI.h"


#include "GUIClient.h"
#include "SettingsStore.h"
#include <graphics/SRGBUtils.h>


GestureUI::GestureUI()
:	gui_client(NULL),
	gestures_visible(false),
	untoggle_button_time(-1)
{}


GestureUI::~GestureUI()
{}


// Column 0: Animation name
// Column 1: Should the animation data control the head (e.g. override the procedural lookat anim)?
// Column 2: Should the animation automatically loop.
// Column 3: Animation duration (from debug output in OpenGLEngine.cpp, conPrint("anim_datum_a..  etc..")
static const char* gestures[] = {
	"Clapping",						"",				"Loop",		"",
	"Dancing",						"AnimHead",		"Loop",		"",
	"Excited",						"AnimHead",		"",			"6.5666666",
	"Looking",						"AnimHead",		"",			"8.016666",
	"Quick Informal Bow",			"AnimHead",		"",			"2.75",
	"Rejected",						"AnimHead",		"",			 "4.8166666",
	"Sit",							"",				"Loop",		"",
	"Sitting On Ground",			"",				"Loop",		"",
	"Sitting Talking",				"",				"Loop",		"",
	"Sleeping Idle",				"AnimHead",		"Loop",		"",
	"Standing React Death Forward",	"AnimHead",		"",			"3.6833334",
	"Waving 1",						"",				"Loop",		"",
	"Waving 2",						"",				"",			"3.1833334",
	"Yawn",							"AnimHead",		"",			"8.35"
};

static const int NUM_GESTURE_FIELDS = 4;

static_assert((staticArrayNumElems(gestures) % NUM_GESTURE_FIELDS) == 0, "(staticArrayNumElems(gestures) % NUM_GESTURE_FIELDS) == 0");

bool GestureUI::animateHead(const std::string& gesture)
{
	for(size_t i=0; i<staticArrayNumElems(gestures); i += NUM_GESTURE_FIELDS)
		if(gestures[i] == gesture)
			return std::string(gestures[i+1]) == "AnimHead";
	assert(0);
	return false;
}


bool GestureUI::loopAnim(const std::string& gesture)
{
	for(size_t i=0; i<staticArrayNumElems(gestures); i += NUM_GESTURE_FIELDS)
		if(gestures[i] == gesture)
			return std::string(gestures[i+2]) == "Loop";
	assert(0);
	return false;
}


void GestureUI::create(Reference<OpenGLEngine>& opengl_engine_, GUIClient* gui_client_, GLUIRef gl_ui_)
{
	opengl_engine = opengl_engine_;
	gui_client = gui_client_;
	gl_ui = gl_ui_;

	gestures_visible = gui_client->getSettingsStore()->getBoolValue("GestureUI/gestures_visible", /*default val=*/false);

	const float min_max_y = GLUI::getViewportMinMaxY(opengl_engine);

	for(size_t i=0; i<staticArrayNumElems(gestures); i += NUM_GESTURE_FIELDS)
	{
		const std::string gesture_name = gestures[i];

		GLUIButtonRef button = new GLUIButton();
		button->create(*gl_ui, opengl_engine,  gui_client->base_dir_path + "/resources/buttons/" + gesture_name + ".png", Vec2f(0.1f + i * 0.15f, -min_max_y + 0.06f), Vec2f(0.1f, 0.1f), /*tooltip=*/gesture_name);
		button->toggleable = true;
		button->client_data = gesture_name;
		button->handler = this;
		gl_ui->addWidget(button);

		gesture_buttons.push_back(button);
	}

	// Create left and right tab buttons
	left_tab_button = new GLUIButton();
	left_tab_button->create(*gl_ui, opengl_engine, gui_client->base_dir_path + "/resources/buttons/left_tab.png", Vec2f(0.1f, 0.1f), Vec2f(0.1f, 0.1f), /*tooltip=*/"View gestures");
	left_tab_button->handler = this;
	gl_ui->addWidget(left_tab_button);
	
	right_tab_button = new GLUIButton();
	right_tab_button->create(*gl_ui, opengl_engine, gui_client->base_dir_path + "/resources/buttons/right_tab.png", Vec2f(0.1f, 0.1f), Vec2f(0.1f, 0.1f), /*tooltip=*/"Hide gestures");
	right_tab_button->handler = this;
	gl_ui->addWidget(right_tab_button);
	
	selfie_button = new GLUIButton();
	selfie_button->create(*gl_ui, opengl_engine, gui_client->base_dir_path + "/resources/buttons/Selfie.png", Vec2f(-0.9f, 0.1f), Vec2f(0.1f, 0.1f), /*tooltip=*/"Selfie view");
	selfie_button->toggleable = true;
	selfie_button->handler = this;
	gl_ui->addWidget(selfie_button);
	
	microphone_button = new GLUIButton();
	microphone_button->create(*gl_ui, opengl_engine, gui_client->base_dir_path + "/resources/buttons/microphone.png", Vec2f(-0.8f, 0.1f), Vec2f(0.1f, 0.1f), /*tooltip=*/"Enable microphone for voice chat");
	microphone_button->toggleable = true;
	microphone_button->handler = this;
	gl_ui->addWidget(microphone_button);

	mic_level_image = new GLUIImage();
	mic_level_image->create(*gl_ui, opengl_engine, ""/*gui_client->base_dir_path + "/resources/buttons/mic_level.png"*/, Vec2f(-0.7f, 0.1f), Vec2f(0.1f, 0.1f), /*tooltip=*/"Microphone input indicator");
	gl_ui->addWidget(mic_level_image);

	updateWidgetPositions();
}


void GestureUI::destroy()
{
	if(left_tab_button.nonNull())
	{
		gl_ui->removeWidget(left_tab_button);
		left_tab_button->destroy();
		left_tab_button = NULL;
	}
	if(right_tab_button.nonNull())
	{
		gl_ui->removeWidget(right_tab_button);
		right_tab_button->destroy();
		right_tab_button = NULL;
	}
	if(selfie_button.nonNull())
	{
		gl_ui->removeWidget(selfie_button);
		selfie_button->destroy();
		selfie_button = NULL;
	}
	if(microphone_button.nonNull())
	{
		gl_ui->removeWidget(microphone_button);
		microphone_button->destroy();
		microphone_button = NULL;
	}
	if(mic_level_image.nonNull())
	{
		gl_ui->removeWidget(mic_level_image);
		mic_level_image->destroy();
		mic_level_image = NULL;
	}


	for(size_t i=0; i<gesture_buttons.size(); ++i)
	{
		gl_ui->removeWidget(gesture_buttons[i]);
		gesture_buttons[i]->destroy();
	}
	gesture_buttons.resize(0);

	gl_ui = NULL;
	opengl_engine = NULL;

	/*if(gl_ui.nonNull())
	{
		gl_ui->destroy();
		gl_ui = NULL;
	}*/
}


void GestureUI::think()
{
	if(gl_ui.nonNull())
	{
		// Untoggle gesture buttons if we have reached untoggle_button_time.
		if((untoggle_button_time > 0) && (timer.elapsed() >= untoggle_button_time))
		{
			for(size_t i=0; i<gesture_buttons.size(); ++i)
				gesture_buttons[i]->setToggled(false);

			untoggle_button_time = -1;
		}
	}
}


//bool GestureUI::handleMouseClick(const Vec2f& gl_coords)
//{
//	if(gl_ui.nonNull())
//		return gl_ui->handleMouseClick(gl_coords);
//	else
//		return false;
//}
//
//
//bool GestureUI::handleMouseMoved(const Vec2f& gl_coords)
//{
//	if(gl_ui.nonNull())
//		return gl_ui->handleMouseMoved(gl_coords);
//	else
//		return false;
//}


static const float BUTTON_W_PIXELS = 50;

void GestureUI::updateWidgetPositions()
{
	if(gl_ui.nonNull())
	{
		const float min_max_y = GLUI::getViewportMinMaxY(opengl_engine);

		const float BUTTON_W = gl_ui->getUIWidthForDevIndepPixelWidth(BUTTON_W_PIXELS);

		const float BUTTON_H = BUTTON_W;
		const float SPACING = BUTTON_W * 0.28f;

		const int NUM_BUTTONS_PER_ROW = 7;
		const float GESTURES_LEFT_X = gestures_visible ? (1 - (BUTTON_W * NUM_BUTTONS_PER_ROW + SPACING * NUM_BUTTONS_PER_ROW)) : 1000;

		for(size_t i=0; i<gesture_buttons.size(); ++i)
		{
			const float x = (i % NUM_BUTTONS_PER_ROW) * (BUTTON_W + SPACING) + GESTURES_LEFT_X;
			const float y = (i / NUM_BUTTONS_PER_ROW) * (BUTTON_H + SPACING);
			gesture_buttons[i]->setPosAndDims(Vec2f(x, -min_max_y + y + SPACING), Vec2f(BUTTON_W, BUTTON_H));
		}

		if(right_tab_button.nonNull())
		{
			const float TAB_BUTTON_W = gl_ui->getUIWidthForDevIndepPixelWidth(35);

			right_tab_button->setPosAndDims(Vec2f(GESTURES_LEFT_X - TAB_BUTTON_W - SPACING, -min_max_y + SPACING), Vec2f(TAB_BUTTON_W, BUTTON_H * 2 + SPACING));

			if(!gestures_visible)
				left_tab_button->setPosAndDims(Vec2f(1 - TAB_BUTTON_W - SPACING, -min_max_y + SPACING), Vec2f(TAB_BUTTON_W, BUTTON_H * 2 + SPACING));
			else
				left_tab_button->setPosAndDims(Vec2f(1000, -min_max_y + SPACING), Vec2f(TAB_BUTTON_W, BUTTON_H * 2 + SPACING)); // hide


			selfie_button->setPosAndDims(Vec2f(-1 + SPACING, -min_max_y + SPACING), Vec2f(BUTTON_W, BUTTON_H));

			const float mic_button_x = -1 + SPACING + BUTTON_W + SPACING;
			microphone_button->setPosAndDims(Vec2f(mic_button_x, -min_max_y + SPACING), Vec2f(BUTTON_W, BUTTON_H));

			mic_level_image->setPosAndDims(Vec2f(mic_button_x + BUTTON_W * 0.8f, -min_max_y + SPACING + BUTTON_H * 0.2f), Vec2f(BUTTON_H * 0.2f, 0));
		}
	}
}


void GestureUI::viewportResized(int w, int h)
{
	if(gl_ui.nonNull())
	{
		updateWidgetPositions();
	}
}


void GestureUI::setVisible(bool visible)
{
	if(gl_ui.nonNull())
	{
		for(size_t i=0; i<gesture_buttons.size(); ++i)
			gesture_buttons[i]->setVisible(visible);

		right_tab_button->setVisible(visible);
		left_tab_button->setVisible(visible);
		selfie_button->setVisible(visible);
		microphone_button->setVisible(visible);
		mic_level_image->setVisible(visible);
	}
}


void GestureUI::eventOccurred(GLUICallbackEvent& event)
{
	if(gui_client)
	{
		GLUIButton* button = static_cast<GLUIButton*>(event.widget);

		for(size_t i=0; i<staticArrayNumElems(gestures); i += NUM_GESTURE_FIELDS)
		{
			const std::string gesture_name = gestures[i];
			if(gesture_name == event.widget->client_data)
			{
				event.accepted = true;
				const bool animate_head = std::string(gestures[i+1]) == "AnimHead";
				const bool loop			= std::string(gestures[i+2]) == "Loop";

				if(button->toggleable)
				{
					if(button->toggled)
					{
						gui_client->performGestureClicked(event.widget->client_data, animate_head, /*loop anim=*/loop);

						if(!loop)
							untoggle_button_time = timer.elapsed() + ::stringToDouble(gestures[i+3]); // Make button untoggle when gesture has finished.
						else
							untoggle_button_time = -1;
					}
					else
						gui_client->stopGestureClicked(event.widget->client_data);
				}
				else
					gui_client->performGestureClicked(event.widget->client_data, animate_head, /*loop anim=*/false);

				// Untoggle any other toggled buttons.
				for(size_t z=0; z<gesture_buttons.size(); ++z)
					if(gesture_buttons[z] != button && gesture_buttons[z]->toggleable)
						gesture_buttons[z]->setToggled(false);
			}
		}

		if(button == left_tab_button.ptr())
		{
			event.accepted = true;
			gestures_visible = true;
			updateWidgetPositions();
			gui_client->getSettingsStore()->setBoolValue("GestureUI/gestures_visible", gestures_visible);
		}
		else if(button == right_tab_button.ptr())
		{
			event.accepted = true;
			gestures_visible = false;
			updateWidgetPositions();
			gui_client->getSettingsStore()->setBoolValue("GestureUI/gestures_visible", gestures_visible);
		}
		else if(button == selfie_button.ptr())
		{
			event.accepted = true;
			gui_client->setSelfieModeEnabled(selfie_button->toggled);
		}
		else if(button == microphone_button.ptr())
		{
			event.accepted = true;
			gui_client->setMicForVoiceChatEnabled(microphone_button->toggled);

			if(microphone_button->toggled)
				microphone_button->tooltip = "Disable microphone for voice chat";
			else
				microphone_button->tooltip = "Enable microphone for voice chat";
		}
	}
}


bool GestureUI::getCurrentGesturePlaying(std::string& gesture_name_out, bool& animate_head_out, bool& loop_out)
{
	for(size_t z=0; z<gesture_buttons.size(); ++z)
	{
		if(gesture_buttons[z]->toggled)
		{
			const std::string button_gesture_name = gesture_buttons[z]->client_data;

			// Find matching gesture
			for(size_t i=0; i<staticArrayNumElems(gestures); i += NUM_GESTURE_FIELDS)
			{
				const std::string gesture_name = gestures[i];
				if(button_gesture_name == gesture_name)
				{
					const bool animate_head = std::string(gestures[i+1]) == "AnimHead";
					const bool loop			= std::string(gestures[i+2]) == "Loop";

					gesture_name_out = gesture_name;
					animate_head_out = animate_head;
					loop_out = loop;
					return true;
				}
			}
		}
	}

	return false;
}


void GestureUI::stopAnyGesturePlaying()
{
	// Untoggle any toggled buttons.
	for(size_t z=0; z<gesture_buttons.size(); ++z)
		gesture_buttons[z]->setToggled(false);

	untoggle_button_time = -1;
}


void GestureUI::turnOffSelfieMode()
{
	selfie_button->setToggled(false);
	gui_client->setSelfieModeEnabled(selfie_button->toggled);
}


void GestureUI::untoggleMicButton()
{
	if(microphone_button.nonNull())
		microphone_button->setToggled(false);
}


void GestureUI::setCurrentMicLevel(float linear_level, float display_level)
{
	if(mic_level_image.nonNull())
	{
		const float BUTTON_W = gl_ui->getUIWidthForDevIndepPixelWidth(BUTTON_W_PIXELS);
		const float BUTTON_H = BUTTON_W;

		mic_level_image->setDims(Vec2f(BUTTON_W * 0.14f, BUTTON_H * display_level * 0.6f));

		// Show a green bar that changes to red if the amplitude gets too close to 1.
		const Colour3f green = toLinearSRGB(Colour3f(0, 54.5f/100, 8.6f/100));
		const Colour3f red   = toLinearSRGB(Colour3f(78.7f / 100, 0, 0));

		mic_level_image->overlay_ob->material.albedo_linear_rgb = Maths::lerp(green, red, Maths::smoothStep(0.9f, 0.95f, linear_level));
	}
}
